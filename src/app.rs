use crate::{
    catalog::{Catalog, Item},
    model::{self, Plan, Skill},
    optimizer,
    storage::{calculation_key, now_ms, Draft, PlanStore, Workspace},
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{collections::BTreeMap, path::PathBuf, sync::Mutex};

pub struct AppService {
    fits: Mutex<crate::fits::FitStore>,
    catalog: Mutex<Catalog>,
    store: Mutex<PlanStore>,
    characters: std::sync::Arc<crate::characters::CharacterService>,
    book_prices: crate::books::BookPrices,
}
type CatalogData = (BTreeMap<u32, Skill>, BTreeMap<u32, Item>);
type PreparedWorkspace = (Workspace, BTreeMap<u32, Item>);
impl AppService {
    pub fn new(data: PathBuf) -> Result<Self, String> {
        Ok(Self {
            fits: Mutex::new(crate::fits::FitStore::new(data.clone())?),
            book_prices: crate::books::BookPrices::new(data.join("book-jita-prices.json")),
            characters: crate::characters::CharacterService::new(data.clone())?,
            catalog: Mutex::new(Catalog::new(data.join("catalog.json"))?),
            store: Mutex::new(PlanStore::new(data)?),
        })
    }
    fn normalize(&self, plan: &mut Plan) -> Result<CatalogData, String> {
        *plan = plan.clone().start_from_scratch();
        if let Some(fit) = &plan.fitting {
            fit.enforce(&mut plan.goals);
        }
        model::validate(plan)?;
        let mut catalog = self.catalog.lock().map_err(|e| e.to_string())?;
        for goal in &plan.goals {
            catalog.ensure_skill(goal.id)?;
        }
        if plan.optimize_implants {
            catalog.ensure_skill(model::CYBERNETICS)?;
        }
        let skills = catalog.skills();
        model::enforce_goal_minima(&mut plan.goals, &skills)?;
        model::jobs(plan, &skills)?;
        Ok((skills, catalog.items.clone()))
    }
    fn prepare_workspace(&self, mut workspace: Workspace) -> Result<PreparedWorkspace, String> {
        if let Some(group) = &workspace.group {
            workspace.plan.goals = group.goals()?;
        }
        let (skills, items) = self.normalize(&mut workspace.plan)?;
        workspace = workspace.sanitize();
        if workspace.result.is_none()
            && workspace.preview.is_none()
            && !workspace.plan.goals.is_empty()
        {
            workspace.preview = Some(optimizer::preview(&workspace.plan, &skills)?);
            workspace.calculation_key = Some(calculation_key(&workspace.plan));
            workspace.calculated_at = Some(now_ms());
        }
        Ok((workspace, items))
    }
    pub fn dispatch(&self, path: &str, body: Value) -> Result<Value, String> {
        match path {
            "/api/fits" => {
                let fits = self.fits.lock().map_err(|e| e.to_string())?;
                let records = fits.list()?;
                let mut usages = BTreeMap::new();
                for record in &records {
                    usages.insert(
                        record.snapshot.id.clone(),
                        fits.usages(&record.snapshot.id)?,
                    );
                }
                Ok(
                    json!({"fits":records,"usages":usages,"pyfa":crate::fits::PyfaConfig::detect(&fits.root)}),
                )
            }
            "/api/fits/save" => {
                #[derive(Deserialize)]
                struct Input {
                    id: Option<String>,
                    name: String,
                    eft: String,
                }
                let input: Input = serde_json::from_value(body).map_err(|e| e.to_string())?;
                let mut catalog = self.catalog.lock().map_err(|e| e.to_string())?;
                let goals = catalog.eft(&input.eft)?;
                let fits = self.fits.lock().map_err(|e| e.to_string())?;
                let source = input
                    .id
                    .as_deref()
                    .map(|id| fits.read(id))
                    .transpose()?
                    .and_then(|old| {
                        if old.snapshot.eft == input.eft {
                            old.snapshot.source
                        } else {
                            None
                        }
                    });
                let record =
                    fits.save(input.id.as_deref(), &input.name, &input.eft, goals, source)?;
                Ok(json!({"fit":record,"items":catalog.items}))
            }
            "/api/fits/archive" => {
                let id = body["id"].as_str().ok_or("Нет ID фита")?;
                let archived = body["archived"].as_bool().unwrap_or(true);
                let fits = self.fits.lock().map_err(|e| e.to_string())?;
                if archived {
                    let usages = fits.usages(id)?;
                    if !usages.is_empty() {
                        return Err(format!(
                            "Сначала отвяжите фит от планов: {}",
                            usages.join(", ")
                        ));
                    }
                }
                fits.archive(id, archived)?;
                Ok(json!({"ok":true}))
            }
            "/api/fits/pyfa/config" => {
                let config: crate::fits::PyfaConfig =
                    serde_json::from_value(body).map_err(|e| e.to_string())?;
                crate::fits::search_pyfa(&config, "__connection_check__")?;
                let fits = self.fits.lock().map_err(|e| e.to_string())?;
                crate::storage::write_json(&fits.root.join("pyfa.json"), &config)?;
                Ok(json!({"ok":true}))
            }
            "/api/fits/pyfa/search" => {
                let config = {
                    let fits = self.fits.lock().map_err(|e| e.to_string())?;
                    crate::fits::PyfaConfig::detect(&fits.root)
                };
                Ok(
                    json!({"fits":crate::fits::search_pyfa(&config,body["query"].as_str().unwrap_or(""))?}),
                )
            }
            "/api/fits/pyfa/import" | "/api/fits/pyfa/check" => {
                let target = body["id"].as_str();
                let config = {
                    let fits = self.fits.lock().map_err(|e| e.to_string())?;
                    crate::fits::PyfaConfig::detect(&fits.root)
                };
                let old = {
                    let fits = self.fits.lock().map_err(|e| e.to_string())?;
                    target.map(|id| fits.read(id)).transpose()?
                };
                let source = old.as_ref().and_then(|r| r.snapshot.source.clone());
                let config = source
                    .as_ref()
                    .map(|s| crate::fits::PyfaConfig {
                        database: s.database.clone(),
                        eve_database: s.eve_database.clone(),
                    })
                    .unwrap_or(config);
                let id = source
                    .as_ref()
                    .map(|s| s.fit_id)
                    .or(body["fit_id"].as_i64())
                    .ok_or("Нет ID фита Pyfa")?;
                let (name, eft, ids, source) = crate::fits::read_pyfa(&config, id)?;
                if path.ends_with("/check") {
                    return Ok(
                        json!({"changed":old.as_ref().and_then(|r|r.snapshot.source.as_ref()).map(|s|s.fingerprint!=source.fingerprint).unwrap_or(true)}),
                    );
                }
                let mut catalog = self.catalog.lock().map_err(|e| e.to_string())?;
                let requirements = catalog.fit_ids(&ids)?;
                let fits = self.fits.lock().map_err(|e| e.to_string())?;
                let existing = if target.is_none() {
                    fits.list()?.into_iter().find(|f| {
                        !f.archived
                            && f.snapshot.source.as_ref().is_some_and(|old| {
                                old.database == source.database && old.fit_id == source.fit_id
                            })
                    })
                } else {
                    old
                };
                let record = if let Some(existing) = existing.filter(|f| {
                    f.snapshot
                        .source
                        .as_ref()
                        .is_some_and(|old| old.fingerprint == source.fingerprint)
                }) {
                    existing
                } else {
                    let existing_id = if let Some(id) = target {
                        Some(id.to_string())
                    } else {
                        fits.list()?
                            .into_iter()
                            .find(|f| {
                                !f.archived
                                    && f.snapshot.source.as_ref().is_some_and(|old| {
                                        old.database == source.database
                                            && old.fit_id == source.fit_id
                                    })
                            })
                            .map(|f| f.snapshot.id)
                    };
                    fits.save(
                        existing_id.as_deref(),
                        &name,
                        &eft,
                        requirements,
                        Some(source),
                    )?
                };
                Ok(json!({"fit":record,"items":catalog.items}))
            }
            "/api/books" => {
                #[derive(Deserialize)]
                struct Input {
                    ids: Vec<u32>,
                    character_id: Option<u64>,
                    character_summary: Option<Value>,
                    #[serde(default)]
                    refresh: bool,
                }
                let input: Input = serde_json::from_value(body).map_err(|e| e.to_string())?;
                let injected = if let Some(id) = input.character_id {
                    if let Ok(snapshot) = self.characters.snapshot(id) {
                        snapshot.trained.keys().copied().collect()
                    } else if let Some(summary) = input
                        .character_summary
                        .filter(|s| s["id"].as_u64() == Some(id))
                    {
                        serde_json::from_value(summary.get("injected_skill_ids").cloned().ok_or("Обновите ESI и пересчитайте адаптацию: в старом снимке нет списка введённых навыков")?).map_err(|e|e.to_string())?
                    } else {
                        return Err("Для подсчёта книг нужен снимок навыков персонажа".into());
                    }
                } else {
                    std::collections::BTreeSet::new()
                };
                let mut report = self
                    .book_prices
                    .quote(&input.ids, &injected, input.refresh)?;
                let catalog = self.catalog.lock().map_err(|e| e.to_string())?;
                for row in &mut report.rows {
                    if let Some(item) = catalog.items.get(&row.id) {
                        row.name = item.name.clone();
                    }
                }
                report.rows.sort_by(|a, b| a.name.cmp(&b.name));
                Ok(json!(report))
            }
            "/api/acceleration/catalog" => {
                Ok(json!({"accelerators":crate::acceleration::catalog()}))
            }
            "/api/acceleration/report" => {
                #[derive(Deserialize)]
                struct Input {
                    workspace: Workspace,
                    character_id: Option<u64>,
                    schedule_mode: String,
                    settings: crate::acceleration::Settings,
                }
                let input: Input = serde_json::from_value(body).map_err(|e| e.to_string())?;
                let (workspace, _) = self.prepare_workspace(input.workspace)?;
                let (schedule, mandatory, context) = if let Some(id) = input.character_id {
                    let adaptation = workspace
                        .adaptations
                        .iter()
                        .find(|a| a.character_id == id)
                        .ok_or("Сначала рассчитайте очередь для персонажа")?;
                    if adaptation.source_key != calculation_key(&workspace.plan) {
                        return Err("Пересчитайте устаревшую адаптацию персонажа".into());
                    }
                    let summary = if let Ok(snapshot) = self.characters.snapshot(id) {
                        if snapshot.fetched_at != adaptation.snapshot_at {
                            return Err(
                                "После обновления ESI нужно пересчитать очередь персонажа".into()
                            );
                        }
                        snapshot.summary()
                    } else {
                        adaptation.character.clone()
                    };
                    (
                        if input.schedule_mode == "baseline" {
                            &adaptation.comparison.baseline
                        } else {
                            &adaptation.comparison.optimized
                        },
                        &adaptation.comparison.baseline,
                        crate::acceleration::Context::from_summary(&summary)?,
                    )
                } else if let Some(result) = &workspace.result {
                    (
                        if input.schedule_mode == "baseline" {
                            &result.baseline
                        } else {
                            &result.optimized
                        },
                        &result.baseline,
                        crate::acceleration::Context::default(),
                    )
                } else {
                    let preview = workspace
                        .preview
                        .as_ref()
                        .ok_or("Сначала соберите очередь обучения")?;
                    (preview, preview, crate::acceleration::Context::default())
                };
                let report = crate::acceleration::analyze(
                    schedule,
                    mandatory,
                    &input.settings,
                    context,
                    now_ms() as i64,
                )?;
                Ok(json!(report))
            }
            "/api/groups/compose" => {
                #[derive(Deserialize)]
                struct Input {
                    name: String,
                    ids: Vec<String>,
                    workspace: Option<Workspace>,
                    #[serde(default)]
                    refresh: bool,
                }
                let input: Input = serde_json::from_value(body).map_err(|e| e.to_string())?;
                let workspace = {
                    let store = self.store.lock().map_err(|e| e.to_string())?;
                    crate::groups::compose(
                        &store,
                        &input.name,
                        &input.ids,
                        input.workspace,
                        input.refresh,
                    )?
                };
                let (workspace, items) = self.prepare_workspace(workspace)?;
                Ok(json!({"workspace":workspace,"items":items}))
            }
            "/api/characters/developers" => {
                crate::server::open_browser("https://developers.eveonline.com/applications");
                Ok(json!({"opened":true}))
            }
            "/api/characters" => self.characters.state(),
            "/api/characters/config" => {
                self.characters.configure(
                    body.get("client_id")
                        .and_then(Value::as_str)
                        .ok_or("Нет Client ID")?,
                )?;
                self.characters.state()
            }
            "/api/characters/connect" => {
                let url = self.characters.begin()?;
                Ok(json!({"url":url}))
            }
            "/api/characters/sync" => {
                let id = body
                    .get("id")
                    .and_then(Value::as_u64)
                    .ok_or("Нет Character ID")?;
                self.characters.sync(id)?;
                self.characters.state()
            }
            "/api/characters/adapt" => {
                #[derive(Deserialize)]
                struct Input {
                    plan: Plan,
                    character_id: u64,
                    #[serde(default)]
                    replace_implants: bool,
                    remap_count: Option<u8>,
                }
                let mut input: Input = serde_json::from_value(body).map_err(|e| e.to_string())?;
                let (skills, items) = self.normalize(&mut input.plan)?;
                let snapshot = self.characters.snapshot(input.character_id)?;
                let adaptation = crate::characters::adapt(
                    &input.plan,
                    &snapshot,
                    &skills,
                    input.replace_implants,
                    input.remap_count,
                )?;
                Ok(json!({"adaptation":adaptation,"items":items}))
            }
            "/api/state" => {
                let store = self.store.lock().map_err(|e| e.to_string())?;
                let saved = store
                    .draft
                    .active_id
                    .as_deref()
                    .and_then(|id| store.read(id).ok());
                let catalog = self.catalog.lock().map_err(|e| e.to_string())?;
                Ok(
                    json!({"plan":store.draft.workspace.plan,"workspace":store.draft.workspace,"active_id":store.draft.active_id,"saved_workspace":saved.map(|r|r.workspace),"items":catalog.items}),
                )
            }
            "/api/resolve" => {
                #[derive(Deserialize)]
                struct Input {
                    name: String,
                }
                let input: Input = serde_json::from_value(body).map_err(|e| e.to_string())?;
                if input.name.len() > 200 {
                    return Err("Название слишком длинное".into());
                }
                let mut catalog = self.catalog.lock().map_err(|e| e.to_string())?;
                let id = catalog.resolve(&input.name)?;
                if catalog.items[&id].skill.is_none() {
                    return Err("Укажите название навыка, а не предмета".into());
                }
                Ok(json!({"id":id,"items":catalog.items}))
            }
            "/api/eft" => {
                let text = body
                    .get("text")
                    .and_then(Value::as_str)
                    .ok_or("Нет EFT-текста")?;
                let mut catalog = self.catalog.lock().map_err(|e| e.to_string())?;
                let goals = catalog.eft(text)?;
                Ok(json!({"goals":goals,"items":catalog.items}))
            }
            "/api/preview" | "/api/calculate" | "/api/save" => {
                let mut plan: Plan = serde_json::from_value(body).map_err(|e| e.to_string())?;
                let (skills, items) = self.normalize(&mut plan)?;
                let key = calculation_key(&plan);
                if path == "/api/save" {
                    let mut store = self.store.lock().map_err(|e| e.to_string())?;
                    let id = store.draft.active_id.clone();
                    store.save(
                        id.as_deref(),
                        Workspace {
                            plan: plan.clone(),
                            ..Workspace::default()
                        },
                    )?;
                    return Ok(json!({"saved":true,"plan":plan}));
                }
                if path == "/api/preview" {
                    return Ok(
                        json!({"schedule":optimizer::preview(&plan,&skills)?,"plan":plan,"items":items,"calculation_key":key}),
                    );
                }
                let mut response = serde_json::to_value(optimizer::optimize(&plan, &skills)?)
                    .map_err(|e| e.to_string())?;
                response["plan"] = json!(plan);
                response["items"] = json!(items);
                response["calculation_key"] = json!(key);
                Ok(response)
            }
            "/api/draft" => {
                let draft: Draft = serde_json::from_value(body).map_err(|e| e.to_string())?;
                self.store
                    .lock()
                    .map_err(|e| e.to_string())?
                    .set_draft(draft)?;
                Ok(json!({"saved":true}))
            }
            "/api/plans" => {
                serde_json::to_value(self.store.lock().map_err(|e| e.to_string())?.list()?)
                    .map_err(|e| e.to_string())
            }
            "/api/workspace/prepare" => {
                let workspace: Workspace =
                    serde_json::from_value(body).map_err(|e| e.to_string())?;
                let (workspace, items) = self.prepare_workspace(workspace)?;
                Ok(json!({"workspace":workspace,"items":items}))
            }
            "/api/plans/save" => {
                #[derive(Deserialize)]
                struct Input {
                    id: Option<String>,
                    workspace: Workspace,
                }
                let input: Input = serde_json::from_value(body).map_err(|e| e.to_string())?;
                let (workspace, _) = self.prepare_workspace(input.workspace)?;
                let record = self
                    .store
                    .lock()
                    .map_err(|e| e.to_string())?
                    .save(input.id.as_deref(), workspace)?;
                Ok(json!({"record":record}))
            }
            "/api/plans/open" => {
                let id = body
                    .get("id")
                    .and_then(Value::as_str)
                    .ok_or("Нет ID плана")?;
                let mut record = self.store.lock().map_err(|e| e.to_string())?.read(id)?;
                let saved_workspace = record.workspace.clone();
                let (workspace, items) = self.prepare_workspace(record.workspace)?;
                record.workspace = workspace;
                self.store
                    .lock()
                    .map_err(|e| e.to_string())?
                    .set_draft(Draft {
                        active_id: Some(id.into()),
                        workspace: record.workspace.clone(),
                    })?;
                Ok(json!({"record":record,"items":items,"saved_workspace":saved_workspace}))
            }
            "/api/plans/rename" => {
                let id = body
                    .get("id")
                    .and_then(Value::as_str)
                    .ok_or("Нет ID плана")?;
                let name = body
                    .get("name")
                    .and_then(Value::as_str)
                    .ok_or("Нет названия")?;
                let record = self
                    .store
                    .lock()
                    .map_err(|e| e.to_string())?
                    .rename(id, name.into())?;
                Ok(json!({"record":record}))
            }
            _ => Err("Неизвестный API".into()),
        }
    }
}
