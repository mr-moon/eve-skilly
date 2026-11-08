use crate::{
    model::Plan,
    optimizer::{Comparison, Schedule},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

const VERSION: u32 = 1;
static SERIAL: AtomicU64 = AtomicU64::new(0);
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn write_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("tmp");
    let bytes = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    let mut file = fs::File::create(&tmp).map_err(|e| e.to_string())?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())?;
    drop(file);
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

pub fn calculation_key(plan: &Plan) -> String {
    let mut value = serde_json::to_value(plan).expect("Plan is serializable");
    value.as_object_mut().unwrap().remove("name");
    format!("optimizer-3:{}", serde_json::to_string(&value).unwrap())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct Workspace {
    pub plan: Plan,
    pub result: Option<Comparison>,
    pub preview: Option<Schedule>,
    pub eft: String,
    pub calculated_at: Option<u64>,
    pub calculation_key: Option<String>,
    pub schedule_mode: String,
    pub adaptations: Vec<crate::characters::Adaptation>,
    pub selected_character: Option<u64>,
    pub character_remaps: std::collections::BTreeMap<u64, u8>,
    pub character_implant_replacements: std::collections::BTreeMap<u64, bool>,
    pub character_extra_remaps: std::collections::BTreeMap<u64, bool>,
    pub group: Option<crate::groups::PlanGroup>,
    pub acceleration_settings: std::collections::BTreeMap<String, crate::acceleration::Settings>,
}
impl Default for Workspace {
    fn default() -> Self {
        Self {
            plan: Plan::default(),
            result: None,
            preview: None,
            eft: String::new(),
            calculated_at: None,
            calculation_key: None,
            schedule_mode: "optimized".into(),
            adaptations: vec![],
            selected_character: None,
            character_remaps: std::collections::BTreeMap::new(),
            character_implant_replacements: std::collections::BTreeMap::new(),
            character_extra_remaps: std::collections::BTreeMap::new(),
            group: None,
            acceleration_settings: std::collections::BTreeMap::new(),
        }
    }
}
impl Workspace {
    pub fn sanitize(mut self) -> Self {
        self.plan = self.plan.start_from_scratch();
        if let Some(fit) = &self.plan.fitting {
            fit.enforce(&mut self.plan.goals);
        }
        if self.calculation_key.as_deref() != Some(calculation_key(&self.plan).as_str()) {
            self.result = None;
            self.preview = None;
            self.calculated_at = None;
            self.calculation_key = None;
        }
        if self.schedule_mode != "baseline" {
            self.schedule_mode = "optimized".into();
        }
        self
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SavedPlan {
    pub schema_version: u32,
    pub id: String,
    pub saved_at: u64,
    pub workspace: Workspace,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Draft {
    pub active_id: Option<String>,
    pub workspace: Workspace,
}
#[derive(Clone, Debug, Serialize)]
pub struct PlanSummary {
    pub id: String,
    pub name: String,
    pub saved_at: u64,
    pub goals: usize,
    pub levels: usize,
    pub days: Option<f64>,
    pub optimized: bool,
    pub group_members: usize,
}
#[derive(Serialize)]
pub struct PlanList {
    pub plans: Vec<PlanSummary>,
    pub warnings: Vec<String>,
}

pub struct PlanStore {
    root: PathBuf,
    pub draft: Draft,
}
impl PlanStore {
    pub fn new(root: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(root.join("plans")).map_err(|e| e.to_string())?;
        let draft_path = root.join("draft.json");
        let draft = if draft_path.exists() {
            let mut draft: Draft =
                serde_json::from_slice(&fs::read(&draft_path).map_err(|e| e.to_string())?)
                    .map_err(|e| format!("Не удалось прочитать черновик: {e}"))?;
            draft.workspace = draft.workspace.sanitize();
            draft
        } else {
            Draft::default()
        };
        let mut store = Self { root, draft };
        let legacy = store.root.join("plan.json");
        if !draft_path.exists() && legacy.exists() && store.list()?.plans.is_empty() {
            let plan: Plan = serde_json::from_slice(&fs::read(legacy).map_err(|e| e.to_string())?)
                .map_err(|e| format!("Не удалось прочитать старый plan.json: {e}"))?;
            if !plan.goals.is_empty() {
                store.save(
                    None,
                    Workspace {
                        plan,
                        ..Workspace::default()
                    },
                )?;
            }
        }
        Ok(store)
    }
    fn path(&self, id: &str) -> Result<PathBuf, String> {
        if id.is_empty() || id.len() > 90 || !id.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
        {
            return Err("Некорректный ID плана".into());
        }
        Ok(self.root.join("plans").join(format!("{id}.json")))
    }
    pub fn read(&self, id: &str) -> Result<SavedPlan, String> {
        let record: SavedPlan = serde_json::from_slice(
            &fs::read(self.path(id)?).map_err(|e| format!("Не удалось открыть план: {e}"))?,
        )
        .map_err(|e| format!("Повреждён файл плана: {e}"))?;
        if record.schema_version != VERSION || record.id != id {
            return Err("Неподдерживаемый формат плана".into());
        }
        Ok(SavedPlan {
            workspace: record.workspace.sanitize(),
            ..record
        })
    }
    pub fn list(&self) -> Result<PlanList, String> {
        let mut plans = vec![];
        let mut warnings = vec![];
        for entry in fs::read_dir(self.root.join("plans")).map_err(|e| e.to_string())? {
            let path = entry.map_err(|e| e.to_string())?.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let Some(id) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            match self.read(id) {
                Ok(record) => {
                    let ws = &record.workspace;
                    let schedule = ws
                        .result
                        .as_ref()
                        .map(|r| &r.optimized)
                        .or(ws.preview.as_ref());
                    plans.push(PlanSummary {
                        id: record.id,
                        name: ws.plan.name.clone(),
                        saved_at: record.saved_at,
                        goals: ws.plan.goals.len(),
                        levels: schedule.map_or(0, |s| s.rows.len()),
                        days: schedule.map(|s| s.days),
                        optimized: ws.result.is_some(),
                        group_members: ws.group.as_ref().map_or(0, |g| g.members.len()),
                    });
                }
                Err(error) => warnings.push(format!("{id}: {error}")),
            }
        }
        plans.sort_by(|a, b| {
            b.saved_at
                .cmp(&a.saved_at)
                .then_with(|| a.name.cmp(&b.name))
        });
        Ok(PlanList { plans, warnings })
    }
    pub fn save(&mut self, id: Option<&str>, workspace: Workspace) -> Result<SavedPlan, String> {
        let workspace = workspace.sanitize();
        crate::model::validate(&workspace.plan)?;
        let id = if let Some(id) = id {
            self.read(id)?;
            id.to_string()
        } else {
            format!(
                "{:x}-{:x}-{:x}",
                now_ms(),
                std::process::id(),
                SERIAL.fetch_add(1, Ordering::Relaxed)
            )
        };
        let record = SavedPlan {
            schema_version: VERSION,
            id,
            saved_at: now_ms(),
            workspace,
        };
        write_json(&self.path(&record.id)?, &record)?;
        self.set_draft(Draft {
            active_id: Some(record.id.clone()),
            workspace: record.workspace.clone(),
        })?;
        Ok(record)
    }
    pub fn set_draft(&mut self, mut draft: Draft) -> Result<(), String> {
        if let Some(id) = &draft.active_id {
            self.path(id)?;
        }
        draft.workspace = draft.workspace.sanitize();
        write_json(&self.root.join("draft.json"), &draft)?;
        self.draft = draft;
        Ok(())
    }
    pub fn open(&mut self, id: &str) -> Result<SavedPlan, String> {
        let record = self.read(id)?;
        self.set_draft(Draft {
            active_id: Some(id.into()),
            workspace: record.workspace.clone(),
        })?;
        Ok(record)
    }
    pub fn rename(&mut self, id: &str, name: String) -> Result<SavedPlan, String> {
        let mut record = self.read(id)?;
        let name = name.trim();
        if name.is_empty() || name.chars().count() > 120 {
            return Err("Название плана: от 1 до 120 символов".into());
        }
        record.workspace.plan.name = name.into();
        record.saved_at = now_ms();
        write_json(&self.path(id)?, &record)?;
        if self.draft.active_id.as_deref() == Some(id) {
            let mut draft = self.draft.clone();
            draft.workspace.plan.name = name.into();
            self.set_draft(draft)?;
        }
        Ok(record)
    }
}

/// Seed only missing files. Existing desktop data is never replaced.
pub fn migrate_legacy(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|e| e.to_string())?;
    let fresh = !destination.join("draft.json").exists() && !destination.join("plans").exists();
    if fresh {
        let plans = source.join("plans");
        if plans.is_dir() {
            fs::create_dir_all(destination.join("plans")).map_err(|e| e.to_string())?;
            for entry in fs::read_dir(plans).map_err(|e| e.to_string())? {
                let path = entry.map_err(|e| e.to_string())?.path();
                if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("json") {
                    fs::copy(
                        &path,
                        destination.join("plans").join(path.file_name().unwrap()),
                    )
                    .map_err(|e| e.to_string())?;
                }
            }
        }
        if source.join("draft.json").is_file() {
            fs::copy(source.join("draft.json"), destination.join("draft.json"))
                .map_err(|e| e.to_string())?;
        }
    }
    for name in ["catalog.json", "plan.json"] {
        let from = source.join(name);
        let to = destination.join(name);
        if from.is_file() && !to.exists() {
            if name == "plan.json"
                && (destination.join("draft.json").exists() || destination.join("plans").exists())
            {
                continue;
            }
            fs::copy(from, to).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Recover profiles from earlier desktop locations, keeping destination records intact.
/// Source files are never changed, including encrypted SSO credentials.
pub fn migrate_desktop_profile(source: &Path, destination: &Path) -> Result<(), String> {
    if source == destination || !source.is_dir() {
        return Ok(());
    }
    migrate_legacy(source, destination)?;
    for name in ["sso.json", "book-jita-prices.json", "pyfa.json"] {
        let from = source.join(name);
        let to = destination.join(name);
        if from.is_file() && !to.exists() {
            fs::copy(from, to).map_err(|e| e.to_string())?;
        }
    }
    for folder in ["plans", "credentials", "fits"] {
        let from = source.join(folder);
        if !from.is_dir() {
            continue;
        }
        let to = destination.join(folder);
        fs::create_dir_all(&to).map_err(|e| e.to_string())?;
        for entry in fs::read_dir(from).map_err(|e| e.to_string())? {
            let file = entry.map_err(|e| e.to_string())?.path();
            let target = to.join(file.file_name().ok_or("Missing profile filename")?);
            if file.is_file() && !target.exists() {
                fs::copy(file, target).map_err(|e| e.to_string())?;
            }
        }
    }
    let from = source.join("characters.json");
    if from.is_file() {
        let incoming: BTreeMap<String, Value> =
            serde_json::from_slice(&fs::read(from).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        let target = destination.join("characters.json");
        let mut existing: BTreeMap<String, Value> = if target.exists() {
            serde_json::from_slice(&fs::read(&target).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?
        } else {
            BTreeMap::new()
        };
        let before = existing.len();
        for (id, snapshot) in incoming {
            existing.entry(id).or_insert(snapshot);
        }
        if existing.len() != before || !target.exists() {
            write_json(&target, &existing)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn directory() -> PathBuf {
        std::env::temp_dir().join(format!(
            "skilly-store-{}-{}",
            std::process::id(),
            SERIAL.fetch_add(1, Ordering::Relaxed)
        ))
    }
    fn workspace(name: &str) -> Workspace {
        Workspace {
            plan: Plan {
                name: name.into(),
                ..Plan::default()
            },
            ..Workspace::default()
        }
    }
    #[test]
    fn desktop_recovery_merges_without_overwriting_current_profile() {
        let source = directory();
        let target = directory();
        for root in [&source, &target] {
            fs::create_dir_all(root.join("credentials")).unwrap();
            fs::create_dir_all(root.join("plans")).unwrap();
        }
        fs::write(
            source.join("characters.json"),
            br#"{"1":{"name":"Old"},"2":{"name":"Recovered"}}"#,
        )
        .unwrap();
        fs::write(
            target.join("characters.json"),
            br#"{"1":{"name":"Current"}}"#,
        )
        .unwrap();
        for folder in ["credentials", "plans"] {
            fs::write(source.join(folder).join("1.json"), b"old").unwrap();
            fs::write(target.join(folder).join("1.json"), b"current").unwrap();
            fs::write(source.join(folder).join("2.json"), b"recovered").unwrap();
        }
        fs::write(source.join("draft.json"), b"old draft").unwrap();
        fs::write(target.join("draft.json"), b"current draft").unwrap();
        migrate_desktop_profile(&source, &target).unwrap();
        migrate_desktop_profile(&source, &target).unwrap();
        let characters: Value =
            serde_json::from_slice(&fs::read(target.join("characters.json")).unwrap()).unwrap();
        assert_eq!(characters["1"]["name"], "Current");
        assert_eq!(characters["2"]["name"], "Recovered");
        for folder in ["credentials", "plans"] {
            assert_eq!(
                fs::read(target.join(folder).join("1.json")).unwrap(),
                b"current"
            );
            assert_eq!(
                fs::read(target.join(folder).join("2.json")).unwrap(),
                b"recovered"
            );
        }
        assert_eq!(
            fs::read(target.join("draft.json")).unwrap(),
            b"current draft"
        );
        assert!(source.join("characters.json").exists());
        fs::remove_dir_all(source).unwrap();
        fs::remove_dir_all(target).unwrap();
    }
    #[test]
    fn multiple_plans_update_independently_and_reopen() {
        let dir = directory();
        let mut store = PlanStore::new(dir.clone()).unwrap();
        let a = store.save(None, workspace("A")).unwrap();
        let b = store.save(None, workspace("B")).unwrap();
        assert_ne!(a.id, b.id);
        store.save(Some(&a.id), workspace("A changed")).unwrap();
        let mut reopened = PlanStore::new(dir.clone()).unwrap();
        assert_eq!(reopened.list().unwrap().plans.len(), 2);
        assert_eq!(
            reopened.open(&a.id).unwrap().workspace.plan.name,
            "A changed"
        );
        assert_eq!(reopened.read(&b.id).unwrap().workspace.plan.name, "B");
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn draft_survives_without_overwriting_saved_plan() {
        let dir = directory();
        let mut store = PlanStore::new(dir.clone()).unwrap();
        let saved = store.save(None, workspace("Saved")).unwrap();
        store
            .set_draft(Draft {
                active_id: Some(saved.id.clone()),
                workspace: workspace("Unsaved changes"),
            })
            .unwrap();
        let store = PlanStore::new(dir.clone()).unwrap();
        assert_eq!(store.draft.workspace.plan.name, "Unsaved changes");
        assert_eq!(store.read(&saved.id).unwrap().workspace.plan.name, "Saved");
        assert!(store.read("../outside").is_err());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn legacy_plan_is_imported_once() {
        let dir = directory();
        fs::create_dir_all(&dir).unwrap();
        let plan = Plan {
            name: "Legacy".into(),
            goals: vec![crate::model::Requirement { id: 3402, level: 3 }],
            ..Plan::default()
        };
        write_json(&dir.join("plan.json"), &plan).unwrap();
        let store = PlanStore::new(dir.clone()).unwrap();
        assert_eq!(store.list().unwrap().plans.len(), 1);
        assert_eq!(store.draft.workspace.plan.name, "Legacy");
        drop(store);
        assert_eq!(
            PlanStore::new(dir.clone())
                .unwrap()
                .list()
                .unwrap()
                .plans
                .len(),
            1
        );
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn desktop_migration_copies_library_and_draft_once() {
        let source = directory();
        let destination = directory();
        let mut browser = PlanStore::new(source.clone()).unwrap();
        let saved = browser.save(None, workspace("Browser plan")).unwrap();
        browser
            .set_draft(Draft {
                active_id: Some(saved.id.clone()),
                workspace: workspace("Browser draft"),
            })
            .unwrap();
        migrate_legacy(&source, &destination).unwrap();
        let mut desktop = PlanStore::new(destination.clone()).unwrap();
        assert_eq!(
            desktop.read(&saved.id).unwrap().workspace.plan.name,
            "Browser plan"
        );
        assert_eq!(desktop.draft.workspace.plan.name, "Browser draft");
        desktop
            .save(Some(&saved.id), workspace("Desktop edit"))
            .unwrap();
        migrate_legacy(&source, &destination).unwrap();
        let desktop = PlanStore::new(destination.clone()).unwrap();
        assert_eq!(desktop.draft.workspace.plan.name, "Desktop edit");
        assert_eq!(
            desktop.read(&saved.id).unwrap().workspace.plan.name,
            "Desktop edit"
        );
        assert_eq!(
            browser.read(&saved.id).unwrap().workspace.plan.name,
            "Browser plan"
        );
        fs::remove_dir_all(source).unwrap();
        fs::remove_dir_all(destination).unwrap();
    }
    #[test]
    fn calculation_snapshot_survives_and_invalidates_when_goals_change() {
        let dir = directory();
        let mut store = PlanStore::new(dir.clone()).unwrap();
        let skills = crate::catalog::demo_items()
            .into_values()
            .filter_map(|t| t.skill.map(|s| (s.id, s)))
            .collect();
        let plan = Plan {
            goals: vec![crate::model::Requirement { id: 3330, level: 5 }],
            remap_count: 2,
            ..Plan::default()
        };
        let result = crate::optimizer::optimize(&plan, &skills).unwrap();
        let days = result.optimized.days;
        let record = store
            .save(
                None,
                Workspace {
                    calculation_key: Some(calculation_key(&plan)),
                    plan,
                    result: Some(result),
                    eft: "[Kestrel, test]".into(),
                    ..Workspace::default()
                },
            )
            .unwrap();
        let mut ws = store.read(&record.id).unwrap().workspace;
        assert_eq!(ws.result.as_ref().unwrap().optimized.days, days);
        ws.plan.name = "Renamed".into();
        assert!(ws.clone().sanitize().result.is_some());
        ws.plan.goals[0].level = 4;
        assert!(ws.sanitize().result.is_none());
        fs::remove_dir_all(dir).unwrap();
    }
}
