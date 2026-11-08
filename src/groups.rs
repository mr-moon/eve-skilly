use crate::{
    model::Requirement,
    storage::{PlanStore, Workspace},
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GroupMember {
    #[serde(default)]
    pub fitting: Option<crate::fits::FitSnapshot>,
    pub id: String,
    pub name: String,
    pub saved_at: u64,
    pub goals: Vec<Requirement>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlanGroup {
    pub members: Vec<GroupMember>,
}
impl PlanGroup {
    pub fn goals(&self) -> Result<Vec<Requirement>, String> {
        if self.members.is_empty() || self.members.len() > 100 {
            return Err("Группа должна содержать от 1 до 100 планов".into());
        }
        let mut ids = BTreeSet::new();
        let mut positions = BTreeMap::new();
        let mut goals: Vec<Requirement> = vec![];
        for member in &self.members {
            if !ids.insert(&member.id) {
                return Err("Один план выбран несколько раз".into());
            }
            let mut member_goals = member.goals.clone();
            if let Some(fit) = &member.fitting {
                fit.enforce(&mut member_goals);
            }
            for goal in &member_goals {
                if !(1..=5).contains(&goal.level) {
                    return Err("Некорректный уровень навыка в группе".into());
                }
                if let Some(&index) = positions.get(&goal.id) {
                    let existing: &mut Requirement = &mut goals[index];
                    existing.level = existing.level.max(goal.level);
                } else {
                    positions.insert(goal.id, goals.len());
                    goals.push(goal.clone());
                }
            }
        }
        if goals.len() > 1000 {
            return Err("В группе больше 1000 целей".into());
        }
        Ok(goals)
    }
}
/// Composition uses snapshots. Refresh is explicit and atomic: a missing source
/// never silently removes its goals or overwrites another saved plan.
pub fn compose(
    store: &PlanStore,
    name: &str,
    ids: &[String],
    existing: Option<Workspace>,
    refresh: bool,
) -> Result<Workspace, String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 120 {
        return Err("Название группы: от 1 до 120 символов".into());
    }
    if ids.is_empty() || ids.len() > 100 {
        return Err("Выберите от 1 до 100 планов".into());
    }
    let mut workspace = existing.unwrap_or_default();
    let mut members = vec![];
    for id in ids {
        let cached = workspace
            .group
            .as_ref()
            .and_then(|g| g.members.iter().find(|m| m.id == *id));
        if !refresh {
            if let Some(member) = cached {
                members.push(member.clone());
                continue;
            }
        }
        let record = store
            .read(id)
            .map_err(|error| format!("Не удалось загрузить участника группы: {error}"))?;
        if record.workspace.group.is_some() {
            return Err("В группу можно добавлять отдельные планы. Вложенные группы пока не поддерживаются.".into());
        }
        members.push(GroupMember {
            fitting: record.workspace.plan.fitting,
            id: id.clone(),
            name: record.workspace.plan.name,
            saved_at: record.saved_at,
            goals: record.workspace.plan.goals,
        });
    }
    let group = PlanGroup { members };
    workspace.plan.goals = group.goals()?;
    workspace.plan.name = name.into();
    workspace.group = Some(group);
    workspace.eft.clear();
    workspace.plan.fitting = None;
    Ok(workspace)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        catalog::demo_items,
        characters::{adapt, CharacterSnapshot},
        model::{Plan, Skill},
        optimizer,
    };
    #[test]
    fn group_deduplicates_max_levels_and_refreshes_without_mutating_sources() {
        let dir = std::env::temp_dir().join(format!(
            "skilly-groups-{}-{}",
            std::process::id(),
            crate::storage::now_ms()
        ));
        let mut store = PlanStore::new(dir.clone()).unwrap();
        let ws = |name: &str, level| Workspace {
            plan: Plan {
                name: name.into(),
                goals: vec![
                    Requirement { id: 3402, level },
                    Requirement { id: 3330, level: 4 },
                ],
                ..Plan::default()
            },
            ..Workspace::default()
        };
        let a = store.save(None, ws("Fit A", 3)).unwrap();
        let b = store.save(None, ws("Manual plan", 5)).unwrap();
        let ids = vec![a.id.clone(), b.id.clone()];
        let group = compose(&store, "Fleet", &ids, None, false).unwrap();
        assert_eq!(group.plan.goals.len(), 2);
        assert_eq!(group.plan.goals[0].level, 5);
        let saved = store.save(None, group.clone()).unwrap();
        store.save(Some(&b.id), ws("Manual changed", 4)).unwrap();
        let cached = compose(&store, "Fleet", &ids, Some(group.clone()), false).unwrap();
        assert_eq!(cached.plan.goals[0].level, 5);
        let refreshed = compose(&store, "Fleet", &ids, Some(group), true).unwrap();
        assert_eq!(refreshed.plan.goals[0].level, 4);
        assert_eq!(store.read(&a.id).unwrap().workspace.plan.goals[0].level, 3);
        assert_eq!(
            store.read(&saved.id).unwrap().workspace.plan.goals[0].level,
            5
        );
        assert!(compose(
            &store,
            "Nested",
            std::slice::from_ref(&saved.id),
            None,
            false
        )
        .is_err());
        let mut reopened = PlanStore::new(dir.clone()).unwrap();
        let group = reopened.open(&saved.id).unwrap().workspace;
        assert_eq!(group.group.unwrap().members.len(), 2);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn whole_group_optimization_and_personalization_share_goals_and_leave_group_intact() {
        let member = |id: &str, goals| GroupMember {
            fitting: None,
            id: id.into(),
            name: id.into(),
            saved_at: 0,
            goals,
        };
        let group = PlanGroup {
            members: vec![
                member("a", vec![Requirement { id: 3402, level: 5 }]),
                member(
                    "b",
                    vec![
                        Requirement { id: 3402, level: 3 },
                        Requirement { id: 3330, level: 5 },
                    ],
                ),
            ],
        };
        let plan = Plan {
            goals: group.goals().unwrap(),
            remap_count: 2,
            optimize_implants: false,
            ..Plan::default()
        };
        let skills: BTreeMap<u32, Skill> = demo_items()
            .into_values()
            .filter_map(|i| i.skill.map(|s| (s.id, s)))
            .collect();
        let result = optimizer::optimize(&plan, &skills).unwrap();
        let saved = serde_json::to_string(&plan).unwrap();
        let pilot = CharacterSnapshot {
            id: 1,
            name: "Pilot".into(),
            fetched_at: 0,
            trained: BTreeMap::from([(3402, 256000.0)]),
            attributes: [20, 20, 19, 20, 20],
            implants: vec![],
            bonuses: [0; 5],
            remap_count: 1,
            bonus_remaps: 0,
            next_remap: None,
            unallocated_sp: 0,
            warnings: vec![],
        };
        let personal = adapt(&plan, &pilot, &skills, false, None).unwrap();
        assert!(personal
            .comparison
            .optimized
            .rows
            .iter()
            .all(|r| r.id != 3402));
        assert!(personal.comparison.optimized.days < result.optimized.days);
        assert_eq!(serde_json::to_string(&plan).unwrap(), saved);
        assert_eq!(
            result
                .optimized
                .rows
                .iter()
                .filter(|r| r.id == 3402 && r.level == 5)
                .count(),
            1
        );
    }
}
