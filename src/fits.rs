use crate::{
    model::Requirement,
    storage::{now_ms, write_json},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PyfaSource {
    pub database: String,
    pub eve_database: String,
    pub fit_id: i64,
    pub fingerprint: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FitSnapshot {
    pub id: String,
    pub name: String,
    pub ship: String,
    pub eft: String,
    pub version: u64,
    pub requirements: Vec<Requirement>,
    pub source: Option<PyfaSource>,
}
impl FitSnapshot {
    pub fn enforce(&self, goals: &mut Vec<Requirement>) {
        for req in &self.requirements {
            if let Some(goal) = goals.iter_mut().find(|g| g.id == req.id) {
                goal.level = goal.level.max(req.level);
            } else {
                goals.push(req.clone());
            }
        }
    }
}
#[derive(Clone, Serialize, Deserialize)]
pub struct FitRecord {
    #[serde(flatten)]
    pub snapshot: FitSnapshot,
    #[serde(default)]
    pub archived: bool,
}
static FIT_SERIAL: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
pub struct FitStore {
    pub root: PathBuf,
}
impl FitStore {
    pub fn new(root: PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(root.join("fits")).map_err(|e| e.to_string())?;
        Ok(Self { root })
    }
    fn path(&self, id: &str) -> Result<PathBuf, String> {
        if id.is_empty() || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') {
            return Err("Некорректный ID фита".into());
        }
        Ok(self.root.join("fits").join(format!("{id}.json")))
    }
    pub fn read(&self, id: &str) -> Result<FitRecord, String> {
        serde_json::from_slice(&std::fs::read(self.path(id)?).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())
    }
    pub fn list(&self) -> Result<Vec<FitRecord>, String> {
        let mut records = vec![];
        for entry in std::fs::read_dir(self.root.join("fits")).map_err(|e| e.to_string())? {
            let path = entry.map_err(|e| e.to_string())?.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                records.push(
                    serde_json::from_slice::<FitRecord>(
                        &std::fs::read(path).map_err(|e| e.to_string())?,
                    )
                    .map_err(|e| e.to_string())?,
                );
            }
        }
        records.sort_by(|a, b| {
            a.snapshot
                .name
                .to_lowercase()
                .cmp(&b.snapshot.name.to_lowercase())
        });
        Ok(records)
    }
    pub fn save(
        &self,
        id: Option<&str>,
        name: &str,
        eft: &str,
        requirements: Vec<Requirement>,
        source: Option<PyfaSource>,
    ) -> Result<FitRecord, String> {
        crate::catalog::eft_names(eft)?;
        let header = eft
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty())
            .ok_or("Нет корабля")?;
        let ship = header[1..header.len() - 1]
            .split(',')
            .next()
            .unwrap()
            .trim()
            .to_string();
        if name.trim().is_empty() || name.chars().count() > 120 {
            return Err("Название фита: от 1 до 120 символов".into());
        }
        let previous = id.map(|id| self.read(id)).transpose()?;
        let version = now_ms().max(
            previous
                .as_ref()
                .map(|r| r.snapshot.version + 1)
                .unwrap_or(0),
        );
        let record = FitRecord {
            snapshot: FitSnapshot {
                id: previous.map(|r| r.snapshot.id).unwrap_or_else(|| {
                    format!(
                        "fit-{version}-{}-{}",
                        std::process::id(),
                        FIT_SERIAL.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
                    )
                }),
                name: name.trim().into(),
                ship,
                eft: eft.into(),
                version,
                requirements,
                source,
            },
            archived: false,
        };
        write_json(&self.path(&record.snapshot.id)?, &record)?;
        Ok(record)
    }
    pub fn archive(&self, id: &str, archived: bool) -> Result<(), String> {
        let mut record = self.read(id)?;
        record.archived = archived;
        write_json(&self.path(id)?, &record)
    }
    pub fn usages(&self, id: &str) -> Result<Vec<String>, String> {
        let mut paths = vec![self.root.join("draft.json")];
        if let Ok(entries) = std::fs::read_dir(self.root.join("plans")) {
            paths.extend(entries.flatten().map(|e| e.path()));
        }
        let mut names = vec![];
        for path in paths {
            if !path.is_file() {
                continue;
            }
            let value: serde_json::Value =
                serde_json::from_slice(&std::fs::read(path).map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())?;
            let w = &value["workspace"];
            let direct = w["plan"]["fitting"]["id"].as_str() == Some(id);
            let group = w["group"]["members"].as_array().is_some_and(|members| {
                members
                    .iter()
                    .any(|m| m["fitting"]["id"].as_str() == Some(id))
            });
            if direct || group {
                names.push(w["plan"]["name"].as_str().unwrap_or("Черновик").to_string());
            }
        }
        names.sort();
        names.dedup();
        Ok(names)
    }
}
#[derive(Default, Serialize, Deserialize)]
pub struct PyfaConfig {
    pub database: String,
    pub eve_database: String,
}
impl PyfaConfig {
    pub fn detect(root: &Path) -> Self {
        if let Ok(bytes) = std::fs::read(root.join("pyfa.json")) {
            if let Ok(config) = serde_json::from_slice(&bytes) {
                return config;
            }
        }
        let home = std::env::var_os("USERPROFILE")
            .or_else(|| std::env::var_os("HOME"))
            .map(PathBuf::from)
            .unwrap_or_default();
        let database = home.join(".pyfa/saveddata.db");
        let mut eve = std::env::var_os("ProgramFiles")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("C:/Program Files"))
            .join("pyfa/app/eve.db");
        if !eve.is_file() {
            eve = home.join(".pyfa/eve.db");
        }
        Self {
            database: database.to_string_lossy().into(),
            eve_database: eve.to_string_lossy().into(),
        }
    }
}
fn db(path: &str) -> Result<rusqlite::Connection, String> {
    let c = rusqlite::Connection::open_with_flags(
        path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("Не удалось прочитать базу Pyfa: {e}"))?;
    c.busy_timeout(std::time::Duration::from_secs(3))
        .map_err(|e| e.to_string())?;
    Ok(c)
}
fn names(config: &PyfaConfig) -> Result<BTreeMap<u32, String>, String> {
    let c = db(&config.eve_database)?;
    let mut stmt = c
        .prepare("SELECT typeID,typeName FROM invtypes WHERE typeName IS NOT NULL")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
}
#[derive(Serialize)]
pub struct PyfaFit {
    pub id: i64,
    pub name: String,
    pub ship: String,
    pub updated: String,
}
pub fn search_pyfa(config: &PyfaConfig, query: &str) -> Result<Vec<PyfaFit>, String> {
    let names = names(config)?;
    let c = db(&config.database)?;
    let mut stmt = c
        .prepare(
            "SELECT ID,name,shipID,COALESCE(modified,'') FROM fits ORDER BY name COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, u32>(2)?,
                r.get::<_, String>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let query = query.to_lowercase();
    let mut fits = vec![];
    for row in rows {
        let (id, name, ship_id, updated) = row.map_err(|e| e.to_string())?;
        let ship = names
            .get(&ship_id)
            .cloned()
            .unwrap_or_else(|| format!("Type #{ship_id}"));
        if format!("{name} {ship}").to_lowercase().contains(&query) {
            fits.push(PyfaFit {
                id,
                name,
                ship,
                updated,
            });
        }
        if fits.len() >= 100 {
            break;
        }
    }
    Ok(fits)
}
pub fn read_pyfa(
    config: &PyfaConfig,
    id: i64,
) -> Result<(String, String, Vec<u32>, PyfaSource), String> {
    let names = names(config)?;
    let mut c = db(&config.database)?;
    let tx = c.transaction().map_err(|e| e.to_string())?;
    let (name, ship): (String, u32) = tx
        .query_row("SELECT name,shipID FROM fits WHERE ID=?", [id], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .map_err(|e| e.to_string())?;
    let lookup = |id: u32| {
        names
            .get(&id)
            .cloned()
            .ok_or_else(|| format!("Pyfa: нет названия Type #{id}"))
    };
    let mut eft = format!(
        "[{}, {}]\n\n",
        lookup(ship)?,
        name.replace(['\n', '\r'], " ")
    );
    let mut ids = vec![ship];
    {
        let mut stmt=tx.prepare("SELECT COALESCE(baseItemID,itemID),chargeID FROM modules WHERE fitID=? AND COALESCE(projected,0)=0 AND itemID IS NOT NULL ORDER BY position,ID").map_err(|e|e.to_string())?;
        for row in stmt
            .query_map([id], |r| {
                Ok((r.get::<_, u32>(0)?, r.get::<_, Option<u32>>(1)?))
            })
            .map_err(|e| e.to_string())?
        {
            let (item, charge) = row.map_err(|e| e.to_string())?;
            ids.push(item);
            eft.push_str(&lookup(item)?);
            if let Some(charge) = charge {
                ids.push(charge);
                eft.push_str(&format!(", {}", lookup(charge)?));
            }
            eft.push('\n');
        }
    }
    for sql in [
        "SELECT COALESCE(baseItemID,itemID),amount FROM drones WHERE fitID=? AND COALESCE(projected,0)=0",
        "SELECT itemID,amount FROM cargo WHERE fitID=?",
        "SELECT itemID,1 FROM boosters WHERE fitID=?",
        "SELECT i.itemID,1 FROM implants i JOIN fitImplants f ON f.implantID=i.ID WHERE f.fitID=?",
        "SELECT itemID,amount FROM fighters WHERE fitID=? AND COALESCE(projected,0)=0",
    ] {
        let mut stmt = tx.prepare(sql).map_err(|e| e.to_string())?;
        eft.push('\n');
        for row in stmt
            .query_map([id], |r| Ok((r.get::<_, u32>(0)?, r.get::<_, u32>(1)?)))
            .map_err(|e| e.to_string())?
        {
            let (item, qty) = row.map_err(|e| e.to_string())?;
            if qty > 0 {
                ids.push(item);
                eft.push_str(&format!("{} x{}\n", lookup(item)?, qty));
            }
        }
    }
    ids.sort();
    ids.dedup();
    use sha2::{Digest, Sha256};
    let fingerprint = format!("{:x}", Sha256::digest(eft.as_bytes()));
    let source = PyfaSource {
        database: config.database.clone(),
        eve_database: config.eve_database.clone(),
        fit_id: id,
        fingerprint,
    };
    Ok((name, eft, ids, source))
}
#[cfg(test)]
mod tests {
    use super::*;
    fn temp() -> PathBuf {
        std::env::temp_dir().join(format!(
            "skilly-fit-test-{}-{}-{}",
            std::process::id(),
            now_ms(),
            FIT_SERIAL.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ))
    }
    fn snapshot() -> FitSnapshot {
        FitSnapshot {
            id: "fit-test".into(),
            name: "Test".into(),
            ship: "Kestrel".into(),
            eft: "[Kestrel, Test]".into(),
            version: 1,
            requirements: vec![Requirement { id: 3402, level: 3 }],
            source: None,
        }
    }
    #[test]
    fn binding_survives_reload_and_enforces_minima_without_changing_snapshot() {
        let fit = snapshot();
        let mut ws = crate::storage::Workspace::default();
        ws.plan.fitting = Some(fit.clone());
        ws.plan.goals = vec![
            Requirement { id: 3402, level: 1 },
            Requirement { id: 3330, level: 5 },
        ];
        let restored: crate::storage::Workspace =
            serde_json::from_value(serde_json::to_value(ws).unwrap()).unwrap();
        let restored = restored.sanitize();
        assert_eq!(restored.plan.goals[0].level, 3);
        assert_eq!(restored.plan.goals[1].level, 5);
        assert_eq!(fit.requirements[0].level, 3);
        let mut missing = vec![];
        fit.enforce(&mut missing);
        assert_eq!(missing[0].level, 3);
        let group = crate::groups::PlanGroup {
            members: vec![crate::groups::GroupMember {
                id: "plan-a".into(),
                name: "A".into(),
                saved_at: 1,
                goals: vec![Requirement { id: 3402, level: 1 }],
                fitting: Some(fit),
            }],
        };
        assert_eq!(group.goals().unwrap()[0].level, 3);
    }
    #[test]
    fn versions_are_snapshots_and_archive_is_reversible() {
        let root = temp();
        let store = FitStore::new(root.clone()).unwrap();
        let first = store
            .save(None, "Old", "[Kestrel, Old]", snapshot().requirements, None)
            .unwrap();
        let second = store
            .save(
                Some(&first.snapshot.id),
                "New",
                "[Kestrel, New]",
                vec![Requirement { id: 3402, level: 4 }],
                None,
            )
            .unwrap();
        assert!(second.snapshot.version > first.snapshot.version);
        assert_eq!(first.snapshot.requirements[0].level, 3);
        store.archive(&first.snapshot.id, true).unwrap();
        assert!(store.read(&first.snapshot.id).unwrap().archived);
        store.archive(&first.snapshot.id, false).unwrap();
        assert!(!store.read(&first.snapshot.id).unwrap().archived);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn api_protects_fitting_and_prevents_archiving_used_fit() {
        let root = temp();
        let store = FitStore::new(root.clone()).unwrap();
        let fit = store
            .save(
                None,
                "Bound",
                "[Kestrel, Bound]",
                snapshot().requirements,
                None,
            )
            .unwrap();
        let service = crate::app::AppService::new(root.clone()).unwrap();
        let mut ws = crate::storage::Workspace::default();
        ws.plan.fitting = Some(fit.snapshot.clone());
        ws.plan.optimize_implants = false;
        let saved = service
            .dispatch("/api/plans/save", serde_json::json!({"workspace":ws}))
            .unwrap();
        assert_eq!(saved["record"]["workspace"]["plan"]["goals"][0]["level"], 3);
        let error = service
            .dispatch(
                "/api/fits/archive",
                serde_json::json!({"id":fit.snapshot.id}),
            )
            .unwrap_err();
        assert!(error.contains("отвяжите"));
        let plan = saved["record"]["workspace"]["plan"].clone();
        let mut tampered = plan.clone();
        tampered["goals"] = serde_json::json!([]);
        let calculated = service.dispatch("/api/calculate", tampered).unwrap();
        assert_eq!(calculated["plan"]["goals"][0]["level"], 3);
        drop(service);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn pyfa_search_and_import_read_only_exclude_projections_and_use_base_items() {
        let root = temp();
        std::fs::create_dir_all(&root).unwrap();
        let data = root.join("saveddata.db");
        let eve = root.join("eve.db");
        let c = rusqlite::Connection::open(&data).unwrap();
        c.execute_batch("CREATE TABLE fits(ID INTEGER,name TEXT,shipID INTEGER,modified TEXT,booster INTEGER);INSERT INTO fits VALUES(1,'Roam',10,'today',0);CREATE TABLE modules(ID INTEGER,fitID INTEGER,itemID INTEGER,baseItemID INTEGER,chargeID INTEGER,projected INTEGER,position INTEGER);INSERT INTO modules VALUES(1,1,999,20,30,0,0);INSERT INTO modules VALUES(2,1,999,NULL,NULL,1,1);CREATE TABLE drones(fitID INTEGER,itemID INTEGER,baseItemID INTEGER,amount INTEGER,projected INTEGER);INSERT INTO drones VALUES(1,40,NULL,5,0);CREATE TABLE cargo(fitID INTEGER,itemID INTEGER,amount INTEGER);CREATE TABLE boosters(fitID INTEGER,itemID INTEGER);CREATE TABLE implants(ID INTEGER,itemID INTEGER);CREATE TABLE fitImplants(fitID INTEGER,implantID INTEGER);CREATE TABLE fighters(fitID INTEGER,itemID INTEGER,amount INTEGER,projected INTEGER);").unwrap();
        drop(c);
        let c = rusqlite::Connection::open(&eve).unwrap();
        c.execute_batch("CREATE TABLE invtypes(typeID INTEGER,typeName TEXT);INSERT INTO invtypes VALUES(10,'Kestrel'),(20,'Launcher'),(30,'Missile'),(40,'Drone');").unwrap();
        drop(c);
        let before = std::fs::read(&data).unwrap();
        let config = PyfaConfig {
            database: data.to_string_lossy().into(),
            eve_database: eve.to_string_lossy().into(),
        };
        assert_eq!(search_pyfa(&config, "kestrel").unwrap().len(), 1);
        assert!(search_pyfa(&config, "missing").unwrap().is_empty());
        let (_, eft, ids, source) = read_pyfa(&config, 1).unwrap();
        assert_eq!(ids, vec![10, 20, 30, 40]);
        assert!(eft.contains("Launcher, Missile"));
        let fit = FitStore::new(root.clone())
            .unwrap()
            .save(None, "Roam", &eft, vec![], Some(source.clone()))
            .unwrap();
        assert_eq!(fit.snapshot.ship, "Kestrel");
        assert!(eft.contains("Drone x5"));
        assert_eq!(source.fit_id, 1);
        assert_eq!(std::fs::read(data).unwrap(), before);
        let c = rusqlite::Connection::open(&config.database).unwrap();
        c.execute("DELETE FROM modules WHERE projected=0", [])
            .unwrap();
        drop(c);
        let service = crate::app::AppService::new(root.clone()).unwrap();
        let checked = service
            .dispatch(
                "/api/fits/pyfa/check",
                serde_json::json!({"id":fit.snapshot.id}),
            )
            .unwrap();
        assert_eq!(checked["changed"], true);
        assert_eq!(
            FitStore::new(root.clone())
                .unwrap()
                .read(&fit.snapshot.id)
                .unwrap()
                .snapshot
                .version,
            fit.snapshot.version
        );
        drop(service);
        std::fs::remove_dir_all(root).unwrap();
    }
}
