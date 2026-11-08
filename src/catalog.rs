use crate::model::{Requirement, Skill};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Item {
    pub id: u32,
    pub name: String,
    pub requirements: Vec<Requirement>,
    pub skill: Option<Skill>,
}

pub struct Catalog {
    pub items: BTreeMap<u32, Item>,
    path: PathBuf,
}

impl Catalog {
    pub fn new(path: PathBuf) -> Result<Self, String> {
        let items = if path.exists() {
            serde_json::from_slice(&std::fs::read(&path).map_err(|e| e.to_string())?)
                .map_err(|e| format!("Повреждён кэш: {e}"))?
        } else {
            demo_items()
        };
        Ok(Self { items, path })
    }

    pub fn skills(&self) -> BTreeMap<u32, Skill> {
        self.items
            .values()
            .filter_map(|t| t.skill.clone().map(|s| (s.id, s)))
            .collect()
    }

    fn persist(&self) -> Result<(), String> {
        crate::server::write_json(&self.path, &self.items)
    }

    pub fn resolve(&mut self, name: &str) -> Result<u32, String> {
        if let Some(id) = self
            .items
            .values()
            .find(|t| t.name.eq_ignore_ascii_case(name.trim()))
            .map(|t| t.id)
        {
            self.fetch(id, &mut BTreeSet::new())?;
            self.persist()?;
            return Ok(id);
        }
        #[derive(Deserialize)]
        struct Resolved {
            inventory_types: Option<Vec<Named>>,
        }
        #[derive(Deserialize)]
        struct Named {
            id: u32,
            name: String,
        }
        let response: Resolved = esi(
            "https://esi.evetech.net/latest/universe/ids/",
            Some(serde_json::to_vec(&[name.trim()]).map_err(|e| e.to_string())?),
        )?;
        let id = response
            .inventory_types
            .unwrap_or_default()
            .into_iter()
            .find(|t| t.name.eq_ignore_ascii_case(name.trim()))
            .ok_or_else(|| format!("Не найден тип: {name}. Нужны английские названия EVE."))?
            .id;
        self.fetch(id, &mut BTreeSet::new())?;
        self.persist()?;
        Ok(id)
    }

    pub fn ensure_skill(&mut self, id: u32) -> Result<(), String> {
        self.fetch(id, &mut BTreeSet::new())?;
        if self.items.get(&id).and_then(|t| t.skill.as_ref()).is_none() {
            return Err(format!("Тип {id} не является навыком"));
        }
        self.persist()
    }

    fn fetch(&mut self, id: u32, visiting: &mut BTreeSet<u32>) -> Result<(), String> {
        if visiting.len() > 50 || !visiting.insert(id) {
            return Err("Цикл/слишком глубокая цепочка ESI".into());
        }
        if let std::collections::btree_map::Entry::Vacant(entry) = self.items.entry(id) {
            #[derive(Deserialize)]
            struct Dogma {
                attribute_id: u32,
                value: f64,
            }
            #[derive(Deserialize)]
            struct Type {
                name: String,
                #[serde(default)]
                dogma_attributes: Vec<Dogma>,
            }
            let t: Type = esi(
                &format!("https://esi.evetech.net/latest/universe/types/{id}/?language=en"),
                None,
            )?;
            let attrs: BTreeMap<u32, f64> = t
                .dogma_attributes
                .into_iter()
                .map(|a| (a.attribute_id, a.value))
                .collect();
            let pairs = [
                (182, 277),
                (183, 278),
                (184, 279),
                (1285, 1286),
                (1289, 1287),
                (1290, 1288),
            ];
            let requirements: Vec<_> = pairs
                .into_iter()
                .filter_map(|(a, b)| {
                    let id = *attrs.get(&a)? as u32;
                    let level = *attrs.get(&b)? as u8;
                    (id > 0 && level > 0).then_some(Requirement { id, level })
                })
                .collect();
            fn attribute(v: f64) -> Option<usize> {
                match v as u32 {
                    165 => Some(0),
                    167 => Some(1),
                    164 => Some(2),
                    168 => Some(3),
                    166 => Some(4),
                    _ => None,
                }
            }
            let skill = if let (Some(rank), Some(primary), Some(secondary)) =
                (attrs.get(&275), attrs.get(&180), attrs.get(&181))
            {
                Some(Skill {
                    id,
                    name: t.name.clone(),
                    rank: *rank,
                    primary: attribute(*primary).ok_or("Неизвестный primary attribute")?,
                    secondary: attribute(*secondary).ok_or("Неизвестный secondary attribute")?,
                    requirements: requirements.clone(),
                })
            } else {
                None
            };
            entry.insert(Item {
                id,
                name: t.name,
                requirements,
                skill,
            });
        }
        let deps = self.items[&id].requirements.clone();
        for r in deps {
            self.fetch(r.id, visiting)?;
        }
        visiting.remove(&id);
        Ok(())
    }

    pub fn fit_ids(&mut self, ids:&[u32])->Result<Vec<Requirement>,String>{
        let mut requirements=BTreeMap::<u32,u8>::new();
        for id in ids { self.fetch(*id,&mut BTreeSet::new())?;
            for r in &self.items[id].requirements { requirements.entry(r.id).and_modify(|v|*v=(*v).max(r.level)).or_insert(r.level); }
        }
        self.persist()?;
        let mut goals:Vec<_>=requirements.into_iter().map(|(id,level)|Requirement{id,level}).collect();
        crate::model::enforce_goal_minima(&mut goals,&self.skills())?;Ok(goals)
    }
    pub fn eft(&mut self, text: &str) -> Result<Vec<Requirement>, String> {
        let names = eft_names(text)?;
        let mut requirements = BTreeMap::<u32, u8>::new();
        // All-or-nothing plan update: unresolved items never silently disappear.
        for name in names {
            let id = self.resolve(&name)?;
            for r in &self.items[&id].requirements {
                requirements
                    .entry(r.id)
                    .and_modify(|l| *l = (*l).max(r.level))
                    .or_insert(r.level);
            }
        }
        let mut goals: Vec<_> = requirements
            .into_iter()
            .map(|(id, level)| Requirement { id, level })
            .collect();
        crate::model::enforce_goal_minima(&mut goals, &self.skills())?;
        Ok(goals)
    }
}

/// Use the OS curl TLS stack; no shell or user-controlled URLs are involved.
fn esi<T: serde::de::DeserializeOwned>(url: &str, body: Option<Vec<u8>>) -> Result<T, String> {
    #[cfg(windows)]
    let executable = "curl.exe";
    #[cfg(not(windows))]
    let executable = "curl";
    let mut command = Command::new(executable);
    command.args([
        "--silent",
        "--show-error",
        "--fail",
        "--max-time",
        "20",
        "--connect-timeout",
        "8",
        "--user-agent",
        "Skilly/0.1 (local skill planner)",
        "--header",
        "Accept: application/json",
    ]);
    if body.is_some() {
        command.args([
            "--header",
            "Content-Type: application/json",
            "--data-binary",
            "@-",
        ]);
    }
    command
        .arg(url)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child=command.spawn().map_err(|e|format!("Не удалось запустить {executable}: {e}. Установите curl для загрузки новых данных ESI."))?;
    if let Some(body) = body {
        child
            .stdin
            .take()
            .ok_or("Нет stdin curl")?
            .write_all(&body)
            .map_err(|e| e.to_string())?;
    }
    // Close stdin also for GET so curl cannot inherit an interactive input stream.
    drop(child.stdin.take());
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(format!(
            "ESI недоступен: {}. Уже загруженные типы работают офлайн.",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    serde_json::from_slice(&output.stdout).map_err(|e| format!("Некорректный ответ ESI: {e}"))
}

pub fn eft_names(text: &str) -> Result<Vec<String>, String> {
    let mut lines = text.lines().map(str::trim).filter(|s| !s.is_empty());
    let header = lines.next().ok_or("Пустой EFT")?;
    if !header.starts_with('[') || !header.ends_with(']') || !header.contains(',') {
        return Err("EFT должен начинаться с [Ship, Fit name]".into());
    }
    let mut names = BTreeSet::new();
    names.insert(
        header[1..header.len() - 1]
            .split(',')
            .next()
            .unwrap()
            .trim()
            .to_string(),
    );
    for line in lines {
        // Pyfa appends abyssal metadata after the fit: [1] Base Module, ...
        if let Some((index, rest)) = line.strip_prefix('[').and_then(|s| s.split_once(']')) {
            if !index.is_empty()
                && index.chars().all(|c| c.is_ascii_digit())
                && !rest.trim().is_empty()
            {
                break;
            }
        }
        if line.starts_with('[') && line.ends_with(']') {
            if line.to_ascii_lowercase().contains("empty") {
                continue;
            }
            return Err("Вставьте один EFT-фит".into());
        }
        if line.starts_with('#') || line.starts_with("//") {
            continue;
        }
        for part in line.split(',') {
            let part = part.trim();
            let name = if let Some((name, quantity)) = part.rsplit_once(" x") {
                if quantity.parse::<u32>().is_ok() {
                    name.trim()
                } else {
                    part
                }
            } else {
                part
            };
            let name = if let Some((base, index)) =
                name.strip_suffix(']').and_then(|s| s.rsplit_once(" ["))
            {
                if !index.is_empty() && index.chars().all(|c| c.is_ascii_digit()) {
                    base.trim()
                } else {
                    name
                }
            } else {
                name
            };
            if !name.is_empty() {
                names.insert(name.to_string());
            }
        }
    }
    if names.len() > 250 {
        return Err("Слишком много типов в фите".into());
    }
    Ok(names.into_iter().collect())
}

pub fn demo_items() -> BTreeMap<u32, Item> {
    let skills = [
        Skill {
            id: 3402,
            name: "Science".into(),
            rank: 1.0,
            primary: 0,
            secondary: 4,
            requirements: vec![],
        },
        Skill {
            id: 3411,
            name: "Cybernetics".into(),
            rank: 3.0,
            primary: 0,
            secondary: 4,
            requirements: vec![Requirement { id: 3402, level: 3 }],
        },
        Skill {
            id: 3327,
            name: "Spaceship Command".into(),
            rank: 1.0,
            primary: 1,
            secondary: 3,
            requirements: vec![],
        },
        Skill {
            id: 3330,
            name: "Caldari Frigate".into(),
            rank: 2.0,
            primary: 1,
            secondary: 3,
            requirements: vec![Requirement { id: 3327, level: 1 }],
        },
        Skill {
            id: 3319,
            name: "Missile Launcher Operation".into(),
            rank: 1.0,
            primary: 1,
            secondary: 3,
            requirements: vec![],
        },
        Skill {
            id: 3321,
            name: "Light Missiles".into(),
            rank: 2.0,
            primary: 1,
            secondary: 3,
            requirements: vec![Requirement { id: 3319, level: 2 }],
        },
    ];
    let mut items: BTreeMap<_, _> = skills
        .into_iter()
        .map(|s| {
            (
                s.id,
                Item {
                    id: s.id,
                    name: s.name.clone(),
                    requirements: s.requirements.clone(),
                    skill: Some(s),
                },
            )
        })
        .collect();
    for (id, name, skill) in [
        (602, "Kestrel", 3330),
        (499, "Light Missile Launcher I", 3321),
    ] {
        items.insert(
            id,
            Item {
                id,
                name: name.into(),
                requirements: vec![Requirement {
                    id: skill,
                    level: 1,
                }],
                skill: None,
            },
        );
    }
    items
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "Requires live public ESI; caches types in target/live-catalog.json"]
    fn naglfar_live_import_and_optimization() {
        let mut catalog = Catalog::new(PathBuf::from("target/live-catalog.json")).unwrap();
        let started = std::time::Instant::now();
        let goals = catalog
            .eft(include_str!("../examples/naglfar-pyfa.eft"))
            .unwrap();
        let capital_ships = catalog
            .items
            .values()
            .find(|item| item.name == "Capital Ships")
            .unwrap()
            .id;
        assert!(goals
            .iter()
            .any(|goal| goal.id == capital_ships && goal.level >= 3));
        assert!(goals.len() > 10);
        let plan = crate::model::Plan {
            goals,
            remap_count: 2,
            ..crate::model::Plan::default()
        };
        let result = crate::optimizer::optimize(&plan, &catalog.skills()).unwrap();
        assert!(!result.optimized.rows.is_empty());
        assert!(result.optimized.days <= result.baseline.days);
        println!(
            "Naglfar: {} goals, {} levels, {:.2} -> {:.2} days, {} remaps, {} purchases; {:?}",
            plan.goals.len(),
            result.optimized.rows.len(),
            result.baseline.days,
            result.optimized.days,
            result.optimized.remaps.len(),
            result.optimized.installations.len(),
            started.elapsed()
        );
    }
    #[test]
    fn full_pyfa_fit_uses_base_modules_and_ignores_mutation_metadata() {
        let names = eft_names(include_str!("../examples/naglfar-pyfa.eft")).unwrap();
        assert!(names.contains(&"Naglfar Fleet Issue".to_string()));
        assert!(names.contains(&"Republic Fleet Gyrostabilizer".to_string()));
        assert!(names.contains(&"Domination Gyrostabilizer".to_string()));
        assert!(names.contains(&"Tracking Speed Script".to_string()));
        assert!(names.contains(&"Agency 'Pyrolancea' DB9 Dose IV".to_string()));
        assert!(names
            .iter()
            .all(|n| !n.contains("Mutaplasmid") && !n.contains("cpu ") && !n.contains('[')));
        assert_eq!(
            names
                .iter()
                .filter(|n| n.as_str() == "Republic Fleet Gyrostabilizer")
                .count(),
            1
        );
    }
    #[test]
    fn eft_extracts_ship_ammo_drones_and_deduplicates() {
        assert_eq!(eft_names("[Kestrel, Test]\nLight Missile Launcher I, Scourge Light Missile\nLight Missile Launcher I\n[Empty Med slot]\nHobgoblin I x2").unwrap(), vec!["Hobgoblin I","Kestrel","Light Missile Launcher I","Scourge Light Missile"]);
        assert!(eft_names("Kestrel").is_err());
    }
}
