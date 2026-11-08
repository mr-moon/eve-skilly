use crate::model::{self, Implant, Job, Plan, CYBERNETICS};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

const DAY: f64 = 1440.0;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Row {
    pub id: u32,
    pub name: String,
    pub level: u8,
    pub points: f64,
    pub primary: usize,
    pub secondary: usize,
    pub start_day: f64,
    pub end_day: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Remap {
    pub day: f64,
    pub attributes: [u8; 5],
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Installation {
    pub day: f64,
    pub bonuses: [u8; 5],
    /// Only these attribute slots need purchasing at this point.
    pub purchases: [u8; 5],
    pub cybernetics: u8,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Schedule {
    pub days: f64,
    pub rows: Vec<Row>,
    pub remaps: Vec<Remap>,
    pub installations: Vec<Installation>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Comparison {
    pub baseline: Schedule,
    pub optimized: Schedule,
    pub saved_days: f64,
    pub searched_maps: usize,
    pub method: String,
}

pub fn remaps() -> Vec<[u8; 5]> {
    let mut out = vec![];
    for a in 0..=10 {
        for b in 0..=10 {
            for c in 0..=10 {
                for d in 0..=10 {
                    let used = a + b + c + d;
                    if used <= 14 && 14 - used <= 10 {
                        out.push([17 + a, 17 + b, 17 + c, 17 + d, 17 + 14 - used]);
                    }
                }
            }
        }
    }
    out
}
fn cyber_level(points: f64) -> u8 {
    (0..=5)
        .rev()
        .find(|l| points + 1e-7 >= model::sp(3.0, *l))
        .unwrap()
}
fn grade(cyber: u8, ceiling: u8) -> u8 {
    let available = match cyber {
        0 => 0,
        1..=3 => 3,
        4 => 4,
        _ => 5,
    };
    available.min(ceiling)
}
fn bonuses(plan: &Plan, cyber: u8, ceiling: u8) -> [u8; 5] {
    std::array::from_fn(|i| {
        if plan.locked_implants[i] {
            plan.implants[i]
        } else {
            plan.implants[i].max(grade(cyber, ceiling))
        }
    })
}
fn cost(job: &Job, attrs: &[u8; 5], bonus: [u8; 5]) -> f64 {
    let rate = attrs[job.skill.primary] as f64
        + bonus[job.skill.primary] as f64
        + (attrs[job.skill.secondary] as f64 + bonus[job.skill.secondary] as f64) / 2.0;
    job.points / rate / DAY
}

/// Reconstruct a schedule. Buy a useful attribute implant just before its first
/// use after unlocking it. With no ISK constraint, this achieves the same speed
/// as buying a full set immediately, without recommending unused slots.
fn schedule(
    plan: &Plan,
    jobs: &[Job],
    order: &[usize],
    ceiling: u8,
    boundaries: &[(usize, [u8; 5])],
) -> Schedule {
    let mut out = Schedule {
        days: 0.0,
        rows: vec![],
        remaps: vec![],
        installations: vec![],
    };
    let mut attrs = plan.attributes;
    let mut cyber = cyber_level(plan.trained.get(&CYBERNETICS).copied().unwrap_or(0.0));
    let mut installed = plan.implants;
    let mut boundary = 0;
    for (pos, &i) in order.iter().enumerate() {
        let job = &jobs[i];
        if boundaries.get(boundary).is_some_and(|(at, _)| *at == pos) {
            attrs = boundaries[boundary].1;
            out.remaps.push(Remap {
                day: out.days,
                attributes: attrs,
            });
            boundary += 1;
        }
        let bonus = bonuses(plan, cyber, ceiling);
        let mut purchases = [0; 5];
        for attribute in [job.skill.primary, job.skill.secondary] {
            if bonus[attribute] > installed[attribute] {
                installed[attribute] = bonus[attribute];
                purchases[attribute] = bonus[attribute];
            }
        }
        if purchases.iter().any(|b| *b > 0) {
            out.installations.push(Installation {
                day: out.days,
                bonuses: installed,
                purchases,
                cybernetics: Implant {
                    day: 0.0,
                    bonuses: purchases,
                }
                .cybernetics(),
            });
        }
        let start = out.days;
        out.days += cost(job, &attrs, bonus);
        out.rows.push(Row {
            id: job.skill.id,
            name: job.skill.name.clone(),
            level: job.level,
            points: job.points,
            primary: job.skill.primary,
            secondary: job.skill.secondary,
            start_day: start,
            end_day: out.days,
        });
        if job.skill.id == CYBERNETICS {
            cyber = cyber.max(job.level);
        }
    }
    out
}

/// Exact dynamic programming for a fixed dependency-safe order. A remap can be
/// used at any level boundary; every one of 2885 legal attribute maps is checked.
/// dp[k][m] either stays on map m, or switches from the cheapest state with k-1
/// remaps. Implant unlocks depend on completed Cybernetics levels, not wall time.
/// Runtime O(levels * available_remaps * maps), no calendar date sampling.
fn solve_order(
    plan: &Plan,
    jobs: &[Job],
    order: &[usize],
    ceiling: u8,
    maps: &[[u8; 5]],
) -> Schedule {
    let count = (plan.remap_count as usize).min(order.len());
    if count == 0 || order.is_empty() {
        return schedule(plan, jobs, order, ceiling, &[]);
    }
    let width = maps.len();
    let stride = (count + 1) * width;
    let mut previous = vec![f64::INFINITY; stride];
    let mut current = previous.clone();
    let mut switches = vec![false; order.len() * stride];
    let mut parents = vec![0usize; order.len() * (count + 1)];
    let mut best_previous = vec![f64::INFINITY; count + 1];
    let mut map_previous = vec![0usize; count + 1];
    let mut base_elapsed = 0.0;
    let mut cyber = cyber_level(plan.trained.get(&CYBERNETICS).copied().unwrap_or(0.0));
    let mut costs = vec![0.0; width];
    for (pos, &i) in order.iter().enumerate() {
        let job = &jobs[i];
        let bonus = bonuses(plan, cyber, ceiling);
        parents[pos * (count + 1)..(pos + 1) * (count + 1)].copy_from_slice(&map_previous);
        for (m, map) in maps.iter().enumerate() {
            costs[m] = cost(job, map, bonus);
        }
        let mut next_best = vec![f64::INFINITY; count + 1];
        let mut next_map = vec![0usize; count + 1];
        for k in 1..=count {
            let from = if k == 1 {
                base_elapsed
            } else {
                best_previous[k - 1]
            };
            for (m, job_cost) in costs.iter().enumerate() {
                let index = k * width + m;
                let switch = from + 1e-12 < previous[index];
                switches[pos * stride + index] = switch;
                let value = if switch { from } else { previous[index] } + job_cost;
                current[index] = value;
                if value < next_best[k] {
                    next_best[k] = value;
                    next_map[k] = m;
                }
            }
        }
        std::mem::swap(&mut previous, &mut current);
        best_previous = next_best;
        map_previous = next_map;
        base_elapsed += cost(job, &plan.attributes, bonus);
        if job.skill.id == CYBERNETICS {
            cyber = cyber.max(job.level);
        }
    }
    let mut best = base_elapsed;
    let mut chosen = 0;
    let mut map = 0;
    for k in 1..=count {
        if best_previous[k] + 1e-9 < best {
            best = best_previous[k];
            chosen = k;
            map = map_previous[k];
        }
    }
    let mut boundaries = vec![];
    for pos in (0..order.len()).rev() {
        if chosen == 0 {
            break;
        }
        if switches[pos * stride + chosen * width + map] {
            boundaries.push((pos, maps[map]));
            if chosen > 1 {
                map = parents[pos * (count + 1) + chosen - 1];
            }
            chosen -= 1;
        }
    }
    boundaries.reverse();
    let out = schedule(plan, jobs, order, ceiling, &boundaries);
    debug_assert!((out.days - best).abs() < 1e-6);
    out
}

/// Priority topological order. Optionally front-load Cybernetics I/IV/V and its
/// prerequisites, then group the remaining levels by their attribute pair.
fn grouped(jobs: &[Job], pair: (usize, usize), cyber_priority: u8) -> Vec<usize> {
    let mut priority = vec![false; jobs.len()];
    fn mark(i: usize, jobs: &[Job], priority: &mut [bool]) {
        if priority[i] {
            return;
        }
        priority[i] = true;
        for &d in &jobs[i].dependencies {
            mark(d, jobs, priority);
        }
    }
    for (i, j) in jobs.iter().enumerate() {
        if j.skill.id == CYBERNETICS && j.level <= cyber_priority {
            mark(i, jobs, &mut priority);
        }
    }
    let mut done = vec![false; jobs.len()];
    let mut out = Vec::with_capacity(jobs.len());
    while out.len() < jobs.len() {
        let i = (0..jobs.len())
            .filter(|i| !done[*i] && jobs[*i].dependencies.iter().all(|d| done[*d]))
            .min_by_key(|i| {
                let s = &jobs[*i].skill;
                (
                    !priority[*i],
                    (s.primary, s.secondary) != pair,
                    s.primary,
                    s.secondary,
                    *i,
                )
            })
            .expect("jobs() produces a DAG");
        done[i] = true;
        out.push(i);
    }
    out
}

pub fn preview(plan: &Plan, skills: &BTreeMap<u32, model::Skill>) -> Result<Schedule, String> {
    let mut base = plan.clone();
    base.upgrades.clear();
    let jobs = model::jobs(&base, skills)?;
    let order: Vec<_> = (0..jobs.len()).collect();
    Ok(schedule(&base, &jobs, &order, 0, &[]))
}

pub fn optimize(plan: &Plan, skills: &BTreeMap<u32, model::Skill>) -> Result<Comparison, String> {
    model::validate(plan)?;
    let mut base = plan.clone();
    base.upgrades.clear();
    let baseline = preview(&base, skills)?;
    let mut optimized = baseline.clone();
    let maps = remaps();
    let ceilings: &[u8] = if plan.optimize_implants && !baseline.rows.is_empty() {
        &[0, 3, 4, 5]
    } else {
        &[0]
    };
    for &ceiling in ceilings {
        let mut candidate = base.clone();
        if ceiling > 0 {
            candidate.upgrades = vec![Implant {
                day: 0.0,
                bonuses: bonuses(&candidate, 5, ceiling),
            }];
        }
        let jobs = model::jobs(&candidate, skills)?;
        let mut orders = BTreeSet::new();
        orders.insert((0..jobs.len()).collect::<Vec<_>>());
        let pairs: BTreeSet<_> = jobs
            .iter()
            .map(|j| (j.skill.primary, j.skill.secondary))
            .collect();
        let target = Implant {
            day: 0.0,
            bonuses: [ceiling; 5],
        }
        .cybernetics();
        let priorities: BTreeSet<_> = [0, 1, target].into_iter().collect();
        for pair in pairs {
            for &priority in &priorities {
                orders.insert(grouped(&jobs, pair, priority));
            }
        }
        for order in orders {
            let result = solve_order(&candidate, &jobs, &order, ceiling, &maps);
            if result.days + 1e-9 < optimized.days {
                optimized = result;
            }
        }
    }
    Ok(Comparison{saved_days:(baseline.days-optimized.days).max(0.0),baseline,optimized,searched_maps:maps.len(),
        method:"Для каждого проверенного порядка: точный выбор атрибутов и точек remap динамическим программированием. Порядок очереди и стратегия Cybernetics/имплантов выбираются эвристически. Omega, без бустеров и инжекторов. Учебные импланты доступны без ограничений ISK; покупка и установка перед первым использованием после Cybernetics. Годовое восстановление remap не моделируется.".into()})
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        catalog::demo_items,
        model::{Requirement, Skill},
    };
    fn skills() -> BTreeMap<u32, Skill> {
        demo_items()
            .into_values()
            .filter_map(|t| t.skill.map(|s| (s.id, s)))
            .collect()
    }
    fn plan(goals: Vec<Requirement>, remap_count: u8) -> Plan {
        Plan {
            goals,
            remap_count,
            optimize_implants: false,
            ..Plan::default()
        }
    }
    #[test]
    fn all_remaps_legal() {
        let maps = remaps();
        assert_eq!(maps.len(), 2885);
        for a in maps {
            assert_eq!(a.iter().map(|a| *a as u16).sum::<u16>(), 99);
            assert!(a.iter().all(|a| (17..=27).contains(a)));
        }
    }
    #[test]
    fn skill_points_thresholds() {
        assert_eq!(
            (1..=5).map(|l| model::sp(1.0, l)).collect::<Vec<_>>(),
            vec![250.0, 1415.0, 8000.0, 45255.0, 256000.0]
        );
    }
    #[test]
    fn no_remaps_uses_base_attributes() {
        let p = plan(vec![Requirement { id: 3402, level: 5 }], 0);
        let r = optimize(&p, &skills()).unwrap();
        assert!(r.optimized.remaps.is_empty());
        assert!((r.optimized.days - 256000.0 / 30.0 / DAY).abs() < 1e-9);
    }
    #[test]
    fn single_attribute_pair_uses_one_remap_even_when_more_available() {
        let p = plan(vec![Requirement { id: 3402, level: 5 }], 3);
        let r = optimize(&p, &skills()).unwrap();
        assert_eq!(r.optimized.remaps.len(), 1);
        assert_eq!(r.optimized.remaps[0].attributes, [27, 17, 17, 17, 21]);
        assert!((r.optimized.days - 256000.0 / 37.5 / DAY).abs() < 1e-9);
    }
    #[test]
    fn two_remaps_outperform_one_for_two_long_groups() {
        let mut p = plan(
            vec![
                Requirement { id: 3402, level: 5 },
                Requirement { id: 3330, level: 5 },
            ],
            1,
        );
        let one = optimize(&p, &skills()).unwrap();
        p.remap_count = 2;
        let two = optimize(&p, &skills()).unwrap();
        assert!(two.optimized.days + 0.01 < one.optimized.days);
        assert_eq!(two.optimized.remaps.len(), 2);
        assert!(two.optimized.remaps[1].day > two.optimized.remaps[0].day);
    }
    #[test]
    fn short_plan_skips_unprofitable_cybernetics() {
        let mut p = plan(vec![Requirement { id: 3327, level: 1 }], 0);
        p.optimize_implants = true;
        let r = optimize(&p, &skills()).unwrap();
        assert!(r.optimized.installations.is_empty());
        assert_eq!(r.optimized.rows.len(), 1);
    }
    #[test]
    fn long_plan_buys_only_useful_slots_after_cybernetics() {
        let mut p = plan(
            vec![
                Requirement { id: 3330, level: 5 },
                Requirement { id: 3321, level: 5 },
            ],
            2,
        );
        p.optimize_implants = true;
        let r = optimize(&p, &skills()).unwrap();
        assert!(!r.optimized.installations.is_empty());
        for e in &r.optimized.installations {
            assert_eq!(e.purchases[2], 0);
            let required = model::sp(3.0, e.cybernetics);
            let trained = r
                .optimized
                .rows
                .iter()
                .filter(|row| row.id == CYBERNETICS && row.end_day <= e.day + 1e-8)
                .map(|row| model::sp(3.0, row.level))
                .fold(0.0, f64::max);
            assert!(trained >= required);
        }
    }
    #[test]
    fn empty_plan_needs_no_purchases_or_remaps() {
        let r = optimize(&Plan::default(), &skills()).unwrap();
        assert_eq!(r.optimized.days, 0.0);
        assert!(r.optimized.installations.is_empty());
        assert!(r.optimized.remaps.is_empty());
    }
    #[test]
    fn mixed_plan_preserves_dependencies_and_never_regresses() {
        let s = skills();
        for count in 0..=3 {
            let mut p = plan(
                vec![
                    Requirement { id: 3330, level: 5 },
                    Requirement { id: 3402, level: 4 },
                    Requirement { id: 3321, level: 4 },
                ],
                count,
            );
            p.optimize_implants = true;
            let r = optimize(&p, &s).unwrap();
            assert!(r.optimized.days <= r.baseline.days + 1e-9);
            assert!(r.optimized.remaps.len() <= count as usize);
            let mut learned = BTreeMap::<u32, f64>::new();
            for row in &r.optimized.rows {
                let skill = &s[&row.id];
                assert!(
                    learned.get(&row.id).copied().unwrap_or(0.0) + 1e-6
                        >= model::sp(skill.rank, row.level - 1)
                );
                for dep in &skill.requirements {
                    assert!(
                        learned.get(&dep.id).copied().unwrap_or(0.0) + 1e-6
                            >= model::sp(s[&dep.id].rank, dep.level)
                    );
                }
                learned.insert(row.id, model::sp(skill.rank, row.level));
            }
            for goal in &p.goals {
                assert!(learned[&goal.id] >= model::sp(s[&goal.id].rank, goal.level));
            }
        }
    }
    #[test]
    fn dp_matches_exhaustive_two_remap_search_on_small_map_set() {
        let p = plan(
            vec![
                Requirement { id: 3402, level: 3 },
                Requirement { id: 3330, level: 3 },
            ],
            2,
        );
        let jobs = model::jobs(&p, &skills()).unwrap();
        let order = (0..jobs.len()).collect::<Vec<_>>();
        let maps = [[27, 17, 17, 17, 21], [17, 27, 17, 21, 17]];
        let dp = solve_order(&p, &jobs, &order, 0, &maps);
        let mut best = schedule(&p, &jobs, &order, 0, &[]).days;
        for i in 0..order.len() {
            for &a in &maps {
                best = best.min(schedule(&p, &jobs, &order, 0, &[(i, a)]).days);
                for j in i + 1..order.len() {
                    for &b in &maps {
                        best = best.min(schedule(&p, &jobs, &order, 0, &[(i, a), (j, b)]).days);
                    }
                }
            }
        }
        assert!((dp.days - best).abs() < 1e-9);
    }
}
