use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub const ATTRS: [&str; 5] = [
    "Intelligence",
    "Perception",
    "Charisma",
    "Willpower",
    "Memory",
];
pub const CYBERNETICS: u32 = 3411;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Requirement {
    pub id: u32,
    pub level: u8,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Skill {
    pub id: u32,
    pub name: String,
    pub rank: f64,
    pub primary: usize,
    pub secondary: usize,
    pub requirements: Vec<Requirement>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Implant {
    /// Earliest purchase/installation time, in days after plan start.
    pub day: f64,
    /// Replacement attribute bonuses; not additive with a previous set.
    pub bonuses: [u8; 5],
}

impl Implant {
    pub fn cybernetics(&self) -> u8 {
        match *self.bonuses.iter().max().unwrap() {
            0 => 0,
            1..=3 => 1,
            4 => 4,
            _ => 5,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QueuePriority {
    #[default]
    FitReady,
    DelayExpensiveBooks,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Plan {
    #[serde(default)]
    pub queue_priority: QueuePriority,
    /// Required fit levels for group members; not additional training goals.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub priority_goals: Vec<Requirement>,
    #[serde(skip)]
    pub book_prices: BTreeMap<u32, f64>,
    #[serde(default)]
    pub fitting: Option<crate::fits::FitSnapshot>,
    pub name: String,
    /// Internal simulator state. User plans always deserialize with zero progress.
    #[serde(skip)]
    pub trained: BTreeMap<u32, f64>,
    pub goals: Vec<Requirement>,
    pub attributes: [u8; 5],
    #[serde(skip)]
    pub implants: [u8; 5],
    /// Occupied character implant slots must not be replaced without opting in.
    #[serde(skip)]
    pub locked_implants: [bool; 5],
    #[serde(skip)]
    pub upgrades: Vec<Implant>,
    #[serde(default = "default_remaps")]
    pub remap_count: u8,
    #[serde(default = "default_implant_optimization")]
    pub optimize_implants: bool,
}

fn default_remaps() -> u8 {
    1
}
fn default_implant_optimization() -> bool {
    true
}

impl Default for Plan {
    fn default() -> Self {
        Self {
            queue_priority: QueuePriority::default(),
            priority_goals: vec![],
            book_prices: BTreeMap::new(),
            fitting: None,
            name: "Новый пилот".into(),
            trained: BTreeMap::new(),
            goals: vec![],
            attributes: [20, 20, 19, 20, 20],
            implants: [0; 5],
            locked_implants: [false; 5],
            upgrades: vec![],
            remap_count: 1,
            optimize_implants: true,
        }
    }
}

impl Plan {
    /// User plans always start from zero; old manual implant dates are ignored.
    pub fn start_from_scratch(mut self) -> Self {
        self.trained.clear();
        self.implants = [0; 5];
        self.locked_implants = [false; 5];
        self.upgrades.clear();
        self
    }
}

pub fn sp(rank: f64, level: u8) -> f64 {
    if level == 0 {
        0.0
    } else {
        (250.0 * rank * 2f64.powf(2.5 * (level as f64 - 1.0))).ceil()
    }
}

#[derive(Clone, Debug)]
pub struct Job {
    pub skill: Skill,
    pub level: u8,
    pub points: f64,
    pub dependencies: Vec<usize>,
}

pub fn validate(plan: &Plan) -> Result<(), String> {
    if plan.attributes.iter().any(|a| !(17..=27).contains(a))
        || plan.attributes.iter().map(|a| *a as u16).sum::<u16>() != 99
    {
        return Err("Базовые атрибуты: каждый 17–27, сумма 99".into());
    }
    if plan.implants.iter().any(|v| *v > 5)
        || plan
            .upgrades
            .iter()
            .any(|e| !e.day.is_finite() || e.day < 0.0 || e.bonuses.iter().any(|v| *v > 5))
    {
        return Err("Импланты: бонус 0–5, день покупки ≥ 0".into());
    }
    let mut upgrades = plan.upgrades.clone();
    upgrades.sort_by(|a, b| a.day.total_cmp(&b.day));
    let mut previous = plan.implants;
    for upgrade in upgrades {
        if upgrade
            .bonuses
            .iter()
            .zip(previous)
            .any(|(next, old)| *next < old)
        {
            return Err(
                "Будущие покупки должны повышать или сохранять бонус каждого атрибута".into(),
            );
        }
        previous = upgrade.bonuses;
    }
    if plan.trained.values().any(|v| !v.is_finite() || *v < 0.0)
        || plan.goals.iter().any(|r| !(1..=5).contains(&r.level))
    {
        return Err("Некорректные SP или уровень цели".into());
    }
    if plan.remap_count > 10 {
        return Err("Количество доступных remap: от 0 до 10".into());
    }
    let cyber = plan.trained.get(&CYBERNETICS).copied().unwrap_or(0.0);
    let required = Implant {
        day: 0.0,
        bonuses: plan.implants,
    }
    .cybernetics();
    if cyber < sp(3.0, required) {
        return Err("Текущие импланты требуют уже изученный Cybernetics (rank 3). Укажите SP или добавьте их как будущую покупку.".into());
    }
    if plan.goals.len() > 1000 || plan.upgrades.len() > 100 {
        return Err("Слишком большой план (максимум 1000 целей / 100 покупок)".into());
    }
    Ok(())
}

/// Prerequisite floors depend on the entire selected skill tree, not just the
/// direct requirements of a ship or module. A target itself is not a floor.
pub fn required_levels(
    goals: &[Requirement],
    skills: &BTreeMap<u32, Skill>,
) -> Result<BTreeMap<u32, u8>, String> {
    fn visit(
        id: u32,
        skills: &BTreeMap<u32, Skill>,
        floors: &mut BTreeMap<u32, u8>,
        visiting: &mut BTreeSet<u32>,
        done: &mut BTreeSet<u32>,
    ) -> Result<(), String> {
        if done.contains(&id) {
            return Ok(());
        }
        if !visiting.insert(id) {
            return Err("Циклическая зависимость навыков".into());
        }
        let skill = skills
            .get(&id)
            .ok_or_else(|| format!("Нет данных навыка {id}. Загрузите его из ESI."))?;
        for r in &skill.requirements {
            if !(1..=5).contains(&r.level) {
                return Err(format!("Некорректный уровень зависимости {}", skill.name));
            }
            floors
                .entry(r.id)
                .and_modify(|level| *level = (*level).max(r.level))
                .or_insert(r.level);
            visit(r.id, skills, floors, visiting, done)?;
        }
        visiting.remove(&id);
        done.insert(id);
        Ok(())
    }
    let mut floors = BTreeMap::new();
    let mut visiting = BTreeSet::new();
    let mut done = BTreeSet::new();
    for g in goals {
        visit(g.id, skills, &mut floors, &mut visiting, &mut done)?;
    }
    Ok(floors)
}

pub fn enforce_goal_minima(
    goals: &mut [Requirement],
    skills: &BTreeMap<u32, Skill>,
) -> Result<(), String> {
    let floors = required_levels(goals, skills)?;
    for goal in goals {
        goal.level = goal.level.max(floors.get(&goal.id).copied().unwrap_or(1));
    }
    Ok(())
}

pub fn jobs(plan: &Plan, skills: &BTreeMap<u32, Skill>) -> Result<Vec<Job>, String> {
    validate(plan)?;
    let mut goals = plan.goals.clone();
    if let Some(level) = plan
        .upgrades
        .iter()
        .map(Implant::cybernetics)
        .max()
        .filter(|v| *v > 0)
    {
        goals.insert(
            0,
            Requirement {
                id: CYBERNETICS,
                level,
            },
        );
    }
    let mut result = vec![];
    let mut done = BTreeMap::<(u32, u8), Option<usize>>::new();
    let mut visiting = BTreeSet::new();
    fn add(
        id: u32,
        level: u8,
        plan: &Plan,
        skills: &BTreeMap<u32, Skill>,
        out: &mut Vec<Job>,
        done: &mut BTreeMap<(u32, u8), Option<usize>>,
        visiting: &mut BTreeSet<(u32, u8)>,
    ) -> Result<Option<usize>, String> {
        if level == 0 {
            return Ok(None);
        }
        if let Some(v) = done.get(&(id, level)) {
            return Ok(*v);
        }
        let skill = skills
            .get(&id)
            .ok_or_else(|| format!("Нет данных навыка {id}. Загрузите его из ESI."))?;
        if !(1..=5).contains(&level)
            || !skill.rank.is_finite()
            || skill.rank <= 0.0
            || skill.primary >= 5
            || skill.secondary >= 5
        {
            return Err(format!("Некорректные данные {}", skill.name));
        }
        let trained = plan.trained.get(&id).copied().unwrap_or(0.0);
        if trained >= sp(skill.rank, level) {
            done.insert((id, level), None);
            return Ok(None);
        }
        if !visiting.insert((id, level)) {
            return Err("Циклическая зависимость навыков".into());
        }
        let mut deps = vec![];
        if let Some(i) = add(id, level - 1, plan, skills, out, done, visiting)? {
            deps.push(i);
        }
        for r in &skill.requirements {
            if let Some(i) = add(r.id, r.level, plan, skills, out, done, visiting)? {
                deps.push(i);
            }
        }
        let i = out.len();
        out.push(Job {
            skill: skill.clone(),
            level,
            points: sp(skill.rank, level) - trained.max(sp(skill.rank, level - 1)),
            dependencies: deps,
        });
        done.insert((id, level), Some(i));
        visiting.remove(&(id, level));
        Ok(Some(i))
    }
    for r in goals {
        add(
            r.id,
            r.level,
            plan,
            skills,
            &mut result,
            &mut done,
            &mut visiting,
        )?;
    }
    if result.len() > 2000 {
        return Err("Очередь слишком большая (максимум 2000 уровней)".into());
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn prerequisites_set_recursive_floors_and_release_them_when_targets_are_removed() {
        let make = |id, name: &str, requirements| Skill {
            id,
            name: name.into(),
            rank: 1.0,
            primary: 0,
            secondary: 4,
            requirements,
        };
        let skills = BTreeMap::from([
            (1, make(1, "Base", vec![])),
            (
                2,
                make(2, "Intermediate", vec![Requirement { id: 1, level: 3 }]),
            ),
            (
                3,
                make(3, "Advanced", vec![Requirement { id: 2, level: 4 }]),
            ),
            (
                4,
                make(4, "Other target", vec![Requirement { id: 1, level: 4 }]),
            ),
        ]);
        let mut goals = vec![
            Requirement { id: 1, level: 1 },
            Requirement { id: 3, level: 1 },
            Requirement { id: 4, level: 1 },
        ];
        enforce_goal_minima(&mut goals, &skills).unwrap();
        assert_eq!(goals[0].level, 4);
        goals.retain(|g| g.id != 4);
        assert_eq!(required_levels(&goals, &skills).unwrap()[&1], 3);
        goals[0].level = 1;
        enforce_goal_minima(&mut goals, &skills).unwrap();
        assert_eq!(goals[0].level, 3);
        goals.retain(|g| g.id != 3);
        assert!(!required_levels(&goals, &skills).unwrap().contains_key(&1));
        goals[0].level = 1;
        enforce_goal_minima(&mut goals, &skills).unwrap();
        assert_eq!(goals[0].level, 1);
    }
    #[test]
    fn legacy_progress_and_manual_implants_are_ignored() {
        let mut legacy = serde_json::to_value(Plan::default()).unwrap();
        legacy["trained"] = serde_json::json!({"3402":256000,"3411":768000});
        legacy["implants"] = serde_json::json!([3, 3, 3, 3, 3]);
        legacy["upgrades"] = serde_json::json!([{"day":20,"bonuses":[5,5,5,5,5]}]);
        let plan: Plan = serde_json::from_value(legacy).unwrap();
        let plan = plan.start_from_scratch();
        assert!(plan.trained.is_empty());
        assert_eq!(plan.implants, [0; 5]);
        assert!(plan.upgrades.is_empty());
        let exported = serde_json::to_value(&plan).unwrap();
        for field in ["trained", "implants", "upgrades", "remap_available_day"] {
            assert!(exported.get(field).is_none());
        }
        assert_eq!(plan.remap_count, 1);
        assert!(plan.optimize_implants);
    }
    #[test]
    fn invalid_attributes_and_implants_are_rejected() {
        let mut p = Plan {
            attributes: [27; 5],
            ..Plan::default()
        };
        assert!(validate(&p).is_err());
        p.attributes = [20, 20, 19, 20, 20];
        p.implants = [4; 5];
        assert!(validate(&p).is_err());
        p.trained.insert(CYBERNETICS, sp(3.0, 4));
        assert!(validate(&p).is_ok());
        p.upgrades = vec![Implant {
            day: 10.0,
            bonuses: [3; 5],
        }];
        assert!(validate(&p).is_err());
        p.upgrades = vec![Implant {
            day: f64::NAN,
            bonuses: [5; 5],
        }];
        assert!(validate(&p).is_err());
    }
    #[test]
    fn cycle_is_rejected_and_fully_trained_goal_is_skipped() {
        let mut skill = Skill {
            id: 1,
            name: "Cycle".into(),
            rank: 1.0,
            primary: 0,
            secondary: 4,
            requirements: vec![Requirement { id: 1, level: 1 }],
        };
        let mut p = Plan {
            goals: vec![Requirement { id: 1, level: 1 }],
            ..Plan::default()
        };
        assert!(jobs(&p, &BTreeMap::from([(1, skill.clone())])).is_err());
        skill.requirements.clear();
        p.trained.insert(1, sp(1.0, 1));
        assert!(jobs(&p, &BTreeMap::from([(1, skill)])).unwrap().is_empty());
    }
}
