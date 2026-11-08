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
#[cfg(test)]
fn solve_order(
    plan: &Plan,
    jobs: &[Job],
    order: &[usize],
    ceiling: u8,
    maps: &[[u8; 5]],
) -> Schedule {
    solve_order_after(plan, jobs, order, ceiling, maps, 0)
}
fn solve_order_after(
    plan: &Plan,
    jobs: &[Job],
    order: &[usize],
    ceiling: u8,
    maps: &[[u8; 5]],
    initial_prefix: usize,
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
            let from = if k == 1 && pos < initial_prefix {
                f64::INFINITY
            } else if k == 1 {
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
    grouped_pairs(jobs, &[pair], cyber_priority)
}
fn grouped_pairs(jobs: &[Job], pairs: &[(usize, usize)], cyber_priority: u8) -> Vec<usize> {
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
                    pairs
                        .iter()
                        .position(|pair| *pair == (s.primary, s.secondary))
                        .unwrap_or(pairs.len()),
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

fn pair_orders(pairs: &[(usize, usize)], attributes: &[u8; 5]) -> Vec<Vec<(usize, usize)>> {
    fn permutations(
        values: &mut [(usize, usize)],
        start: usize,
        out: &mut Vec<Vec<(usize, usize)>>,
    ) {
        if start == values.len() {
            out.push(values.to_vec());
            return;
        }
        for i in start..values.len() {
            values.swap(start, i);
            permutations(values, start + 1, out);
            values.swap(start, i);
        }
    }
    if pairs.len() <= 5 {
        let mut out = vec![];
        permutations(&mut pairs.to_vec(), 0, &mut out);
        return out;
    }
    // Keep larger plans bounded while considering both directions and orders
    // that use the current map before spending a remap.
    let mut out = BTreeSet::new();
    for mut order in [pairs.to_vec(), pairs.iter().rev().copied().collect()] {
        for _ in 0..pairs.len() {
            out.insert(order.clone());
            order.rotate_left(1);
        }
    }
    let current = *pairs
        .iter()
        .max_by_key(|&&(p, s)| 2 * u16::from(attributes[p]) + u16::from(attributes[s]))
        .unwrap();
    for mut order in [pairs.to_vec(), pairs.iter().rev().copied().collect()] {
        order.retain(|pair| *pair != current);
        order.insert(0, current);
        out.insert(order);
    }
    out.into_iter().collect()
}
fn better_schedule(candidate: &Schedule, current: &Schedule) -> bool {
    if candidate.days < current.days - 1e-9 {
        return true;
    }
    if (candidate.days - current.days).abs() > 1e-9 {
        return false;
    }
    if candidate.remaps.len() != current.remaps.len() {
        return candidate.remaps.len() < current.remaps.len();
    }
    candidate.remaps.first().map_or(f64::INFINITY, |r| r.day)
        > current.remaps.first().map_or(f64::INFINITY, |r| r.day) + 1e-9
}

pub fn preview(plan: &Plan, skills: &BTreeMap<u32, model::Skill>) -> Result<Schedule, String> {
    let mut base = plan.clone();
    base.upgrades.clear();
    let jobs = model::jobs(&base, skills)?;
    let order: Vec<_> = (0..jobs.len()).collect();
    Ok(schedule(&base, &jobs, &order, 0, &[]))
}

/// Reorder only inside an unchanged attribute/rate segment. Remap, implant and
/// Cybernetics boundaries stay fixed, so the chosen training time cannot regress.
fn prioritize_rows(
    plan: &Plan,
    skills: &BTreeMap<u32, model::Skill>,
    out: &mut Schedule,
) -> Result<(), String> {
    use model::QueuePriority;
    let mut milestone = plan.clone();
    milestone.upgrades.clear();
    milestone.goals = if let Some(fit) = &plan.fitting {
        fit.requirements.clone()
    } else if !plan.priority_goals.is_empty() {
        plan.priority_goals.clone()
    } else {
        plan.goals.clone()
    };
    let required: BTreeSet<_> = model::jobs(&milestone, skills)?
        .iter()
        .map(|j| (j.skill.id, j.level))
        .collect();
    let mut learned: BTreeMap<u32, u8> = plan
        .trained
        .iter()
        .filter_map(|(&id, &sp)| {
            skills.get(&id).map(|skill| {
                (
                    id,
                    (0..=5)
                        .rev()
                        .find(|&level| model::sp(skill.rank, level) <= sp + 1e-7)
                        .unwrap(),
                )
            })
        })
        .collect();
    let mut opened: BTreeSet<u32> = plan.trained.keys().copied().collect();
    let event_at = |day: f64| {
        out.remaps.iter().any(|e| (e.day - day).abs() < 1e-8)
            || out.installations.iter().any(|e| (e.day - day).abs() < 1e-8)
    };
    let mut start = 0;
    while start < out.rows.len() {
        let first = &out.rows[start];
        let mut end = start + 1;
        while end < out.rows.len()
            && first.id != CYBERNETICS
            && out.rows[end].id != CYBERNETICS
            && (out.rows[end].primary, out.rows[end].secondary) == (first.primary, first.secondary)
            && !event_at(out.rows[end].start_day)
        {
            end += 1;
        }
        // Work on a copy and reject any snapshot with unsatisfied prerequisites.
        let mut pending: Vec<(usize, Row)> =
            out.rows[start..end].iter().cloned().enumerate().collect();
        let mut sorted = Vec::with_capacity(pending.len());
        while !pending.is_empty() {
            let ready = |row: &Row| {
                learned.get(&row.id).copied().unwrap_or(0) + 1 >= row.level
                    && skills[&row.id]
                        .requirements
                        .iter()
                        .all(|r| learned.get(&r.id).copied().unwrap_or(0) >= r.level)
            };
            let mut remaining = BTreeMap::<u32, f64>::new();
            for (_, row) in &pending {
                *remaining.entry(row.id).or_default() += row.points;
            }
            let key = |row: &Row| match plan.queue_priority {
                QueuePriority::FitReady => (
                    u8::from(!required.contains(&(row.id, row.level))),
                    remaining[&row.id],
                ),
                QueuePriority::DelayExpensiveBooks => {
                    if opened.contains(&row.id) {
                        (0, 0.0)
                    } else {
                        (
                            1,
                            plan.book_prices
                                .get(&row.id)
                                .copied()
                                .filter(|p| p.is_finite() && *p > 0.0)
                                .unwrap_or(f64::INFINITY),
                        )
                    }
                }
            };
            let selected = pending
                .iter()
                .enumerate()
                .filter(|(_, (_, r))| ready(r))
                .min_by(|(_, a), (_, b)| {
                    let ka = key(&a.1);
                    let kb = key(&b.1);
                    ka.0.cmp(&kb.0)
                        .then_with(|| ka.1.total_cmp(&kb.1))
                        .then(a.0.cmp(&b.0))
                })
                .map(|(i, _)| i)
                .ok_or("Нарушены зависимости при сортировке очереди")?;
            let (_, row) = pending.remove(selected);
            learned.insert(row.id, row.level);
            opened.insert(row.id);
            sorted.push(row);
        }
        let mut elapsed = out.rows[start].start_day;
        let finish = out.rows[end - 1].end_day;
        for row in &mut sorted {
            let duration = row.end_day - row.start_day;
            row.start_day = elapsed;
            elapsed += duration;
            row.end_day = elapsed;
        }
        if let Some(last) = sorted.last_mut() {
            last.end_day = finish;
        }
        out.rows[start..end].clone_from_slice(&sorted);
        start = end;
    }
    Ok(())
}

pub fn optimize(plan: &Plan, skills: &BTreeMap<u32, model::Skill>) -> Result<Comparison, String> {
    optimize_inner(plan, skills, false)
}
fn optimize_inner(
    plan: &Plan,
    skills: &BTreeMap<u32, model::Skill>,
    preserve_current: bool,
) -> Result<Comparison, String> {
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
        for &pair in &pairs {
            for &priority in &priorities {
                orders.insert(grouped(&jobs, pair, priority));
            }
        }
        for pair_order in pair_orders(&pairs.into_iter().collect::<Vec<_>>(), &plan.attributes) {
            for &priority in &priorities {
                orders.insert(grouped_pairs(&jobs, &pair_order, priority));
            }
        }
        let current_pair = jobs
            .iter()
            .map(|j| (j.skill.primary, j.skill.secondary))
            .max_by_key(|&(p, s)| {
                2 * u16::from(plan.attributes[p]) + u16::from(plan.attributes[s])
            });
        for order in orders {
            let prefix = if preserve_current {
                order
                    .iter()
                    .take_while(|&&i| {
                        Some((jobs[i].skill.primary, jobs[i].skill.secondary)) == current_pair
                    })
                    .count()
            } else {
                0
            };
            if preserve_current && prefix == 0 {
                continue;
            }
            let result = solve_order_after(&candidate, &jobs, &order, ceiling, &maps, prefix);
            if better_schedule(&result, &optimized) {
                optimized = result;
            }
        }
    }
    prioritize_rows(plan, skills, &mut optimized)?;
    let priority_note = match plan.queue_priority {
        model::QueuePriority::FitReady => "Внутри групп атрибутов сначала обязательные уровни фита, затем короткие цели.",
        model::QueuePriority::DelayExpensiveBooks => "Внутри групп атрибутов сначала открытые навыки и дешёвые книги Jita, затем дорогие; неизвестные цены — после известных. Это эвристика, без гарантии оптимального графика расходов.",
    };
    let missing_prices = if plan.queue_priority == model::QueuePriority::DelayExpensiveBooks {
        optimized
            .rows
            .iter()
            .map(|r| r.id)
            .filter(|id| !plan.trained.contains_key(id) && !plan.book_prices.contains_key(id))
            .collect::<BTreeSet<_>>()
            .len()
    } else {
        0
    };
    let price_note = if missing_prices > 0 {
        format!(" Нет цены Jita для {missing_prices} книг; их стоимость не считается нулевой.")
    } else {
        String::new()
    };
    Ok(Comparison{saved_days:(baseline.days-optimized.days).max(0.0),baseline,optimized,searched_maps:maps.len(),
        method:format!("{priority_note}{price_note} Для каждого проверенного порядка: точный выбор атрибутов и точек remap динамическим программированием. Порядок очереди и стратегия Cybernetics/имплантов выбираются эвристически. Omega, без бустеров и инжекторов. Учебные импланты доступны без ограничений ISK; покупка и установка перед первым использованием после Cybernetics. Годовое восстановление remap не моделируется.")})
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RemapTradeoff {
    pub conservative_days: f64,
    pub fastest_days: f64,
    pub saved_days: f64,
    pub conservative_remaps: usize,
    pub fastest_remaps: usize,
}
/// A trip away from, then back to, the pilot's current map is opt-in.
/// Compare the fast route with one fewer remap and a useful current-map prefix.
pub fn optimize_personal(
    plan: &Plan,
    skills: &BTreeMap<u32, model::Skill>,
    extra_remap: bool,
) -> Result<(Comparison, Option<RemapTradeoff>), String> {
    let fastest = optimize(plan, skills)?;
    let events = &fastest.optimized.remaps;
    let returns_to_current = events
        .first()
        .is_some_and(|r| r.day <= 1e-9 && r.attributes != plan.attributes)
        && events
            .iter()
            .skip(1)
            .any(|r| r.attributes == plan.attributes);
    if !returns_to_current {
        return Ok((fastest, None));
    }
    let mut limited = plan.clone();
    limited.remap_count = (events.len() - 1) as u8;
    let conservative = optimize_inner(&limited, skills, true)?;
    let gain = conservative.optimized.days - fastest.optimized.days;
    if gain < -1e-9 || conservative.optimized.remaps.len() >= events.len() {
        return Ok((fastest, None));
    }
    let offer = (gain > 1e-9).then(|| RemapTradeoff {
        conservative_days: conservative.optimized.days,
        fastest_days: fastest.optimized.days,
        saved_days: gain,
        conservative_remaps: conservative.optimized.remaps.len(),
        fastest_remaps: events.len(),
    });
    Ok((
        if extra_remap && offer.is_some() {
            fastest
        } else {
            conservative
        },
        offer,
    ))
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
    fn priority_skills() -> BTreeMap<u32, Skill> {
        [1, 2, 3]
            .into_iter()
            .map(|id| {
                (
                    id,
                    Skill {
                        id,
                        name: format!("Skill {id}"),
                        rank: 1.0,
                        primary: 0,
                        secondary: 4,
                        requirements: vec![],
                    },
                )
            })
            .collect()
    }
    #[test]
    fn fit_priority_moves_minimum_levels_and_their_prerequisites_before_optional_training() {
        let mut skills = priority_skills();
        skills.get_mut(&2).unwrap().requirements = vec![model::Requirement { id: 3, level: 1 }];
        let mut p = plan(
            vec![
                model::Requirement { id: 1, level: 3 },
                model::Requirement { id: 2, level: 2 },
            ],
            0,
        );
        p.priority_goals = vec![model::Requirement { id: 2, level: 1 }];
        let original = preview(&p, &skills).unwrap();
        let mut sorted = original.clone();
        prioritize_rows(&p, &skills, &mut sorted).unwrap();
        assert_eq!(
            sorted
                .rows
                .iter()
                .take(2)
                .map(|r| (r.id, r.level))
                .collect::<Vec<_>>(),
            vec![(3, 1), (2, 1)]
        );
        assert_eq!(sorted.days, original.days);
        assert!(
            sorted.rows[1].end_day
                < original
                    .rows
                    .iter()
                    .find(|r| r.id == 2 && r.level == 1)
                    .unwrap()
                    .end_day
        );
    }
    #[test]
    fn expensive_books_are_delayed_but_already_injected_zero_sp_skills_are_first() {
        let skills = priority_skills();
        let mut p = plan(
            vec![
                model::Requirement { id: 1, level: 2 },
                model::Requirement { id: 2, level: 2 },
                model::Requirement { id: 3, level: 2 },
            ],
            0,
        );
        p.queue_priority = model::QueuePriority::DelayExpensiveBooks;
        p.book_prices = BTreeMap::from([(1, 1_000_000.0), (2, 10.0), (3, 2_000_000.0)]);
        p.trained.insert(3, 0.0);
        let mut sorted = preview(&p, &skills).unwrap();
        let original_days = sorted.days;
        prioritize_rows(&p, &skills, &mut sorted).unwrap();
        assert_eq!(
            sorted.rows.iter().map(|r| r.id).collect::<Vec<_>>(),
            vec![3, 3, 2, 2, 1, 1]
        );
        assert_eq!(sorted.days, original_days);
    }
    #[test]
    fn price_priority_respects_dependencies_and_does_not_treat_unknown_as_free() {
        let mut skills = priority_skills();
        skills.get_mut(&2).unwrap().requirements = vec![model::Requirement { id: 1, level: 1 }];
        let mut p = plan(
            vec![
                model::Requirement { id: 3, level: 1 },
                model::Requirement { id: 2, level: 1 },
            ],
            0,
        );
        p.queue_priority = model::QueuePriority::DelayExpensiveBooks;
        p.book_prices = BTreeMap::from([(1, 100.0), (2, 1.0)]);
        let mut sorted = preview(&p, &skills).unwrap();
        prioritize_rows(&p, &skills, &mut sorted).unwrap();
        assert_eq!(
            sorted.rows.iter().map(|r| r.id).collect::<Vec<_>>(),
            vec![1, 2, 3]
        );
    }
    #[test]
    fn priorities_keep_remap_implant_and_cybernetics_boundaries_and_training_time() {
        let mut skills = priority_skills();
        skills.insert(
            CYBERNETICS,
            Skill {
                id: CYBERNETICS,
                name: "Cybernetics".into(),
                rank: 3.0,
                primary: 0,
                secondary: 4,
                requirements: vec![],
            },
        );
        let mut p = plan(
            vec![
                model::Requirement { id: 1, level: 2 },
                model::Requirement {
                    id: CYBERNETICS,
                    level: 1,
                },
                model::Requirement { id: 2, level: 2 },
            ],
            1,
        );
        p.queue_priority = model::QueuePriority::DelayExpensiveBooks;
        p.book_prices = BTreeMap::from([(1, 1000.0), (2, 1.0)]);
        let jobs = model::jobs(&p, &skills).unwrap();
        let order = (0..jobs.len()).collect::<Vec<_>>();
        let mut original = schedule(&p, &jobs, &order, 3, &[(1, [27, 17, 17, 17, 21])]);
        let before = original.clone();
        prioritize_rows(&p, &skills, &mut original).unwrap();
        assert_eq!(original.days, before.days);
        assert_eq!(
            serde_json::to_value(&original.remaps).unwrap(),
            serde_json::to_value(&before.remaps).unwrap()
        );
        assert_eq!(
            serde_json::to_value(&original.installations).unwrap(),
            serde_json::to_value(&before.installations).unwrap()
        );
        for row in before.rows.iter().filter(|r| r.id == CYBERNETICS) {
            let after = original
                .rows
                .iter()
                .find(|r| r.id == row.id && r.level == row.level)
                .unwrap();
            assert_eq!(after.start_day, row.start_day);
            assert_eq!(after.end_day, row.end_day);
        }
        for pair in original.rows.windows(2) {
            assert!((pair[0].end_day - pair[1].start_day).abs() < 1e-8);
        }
    }
    #[test]
    fn queue_priority_roundtrips_and_invalidates_old_calculations() {
        let p = plan(vec![model::Requirement { id: 3402, level: 5 }], 0);
        let key = crate::storage::calculation_key(&p);
        let mut value = serde_json::to_value(&p).unwrap();
        value.as_object_mut().unwrap().remove("queue_priority");
        let legacy: Plan = serde_json::from_value(value).unwrap();
        assert_eq!(legacy.queue_priority, model::QueuePriority::FitReady);
        let mut next = p.clone();
        next.queue_priority = model::QueuePriority::DelayExpensiveBooks;
        assert_ne!(key, crate::storage::calculation_key(&next));
        let roundtrip: Plan = serde_json::from_str(&serde_json::to_string(&next).unwrap()).unwrap();
        assert_eq!(
            roundtrip.queue_priority,
            model::QueuePriority::DelayExpensiveBooks
        );
    }
    #[test]
    fn current_map_then_mixed_intelligence_groups_avoids_an_unnecessary_return() {
        let pairs = [
            (1, 3, 4.0),
            (0, 1, 1.0),
            (0, 4, 2.0),
            (3, 1, 4.0),
            (4, 0, 2.0),
        ];
        let skills = pairs
            .iter()
            .enumerate()
            .map(|(i, &(primary, secondary, rank))| {
                let id = i as u32 + 1;
                (
                    id,
                    Skill {
                        id,
                        name: format!("Skill {id}"),
                        rank,
                        primary,
                        secondary,
                        requirements: vec![],
                    },
                )
            })
            .collect::<BTreeMap<_, _>>();
        let mut p = plan(
            (1..=5)
                .map(|id| model::Requirement { id, level: 5 })
                .collect(),
            2,
        );
        p.attributes = [17, 27, 17, 21, 17];
        let jobs = model::jobs(&p, &skills).unwrap();
        let maps = remaps();
        let mut old = preview(&p, &skills).unwrap();
        for &(primary, secondary, _) in &pairs {
            let s = solve_order(
                &p,
                &jobs,
                &grouped(&jobs, (primary, secondary), 0),
                0,
                &maps,
            );
            if better_schedule(&s, &old) {
                old = s;
            }
        }
        let new = optimize(&p, &skills).unwrap().optimized;
        assert!(
            new.days < old.days - 0.01,
            "new {}, old {}",
            new.days,
            old.days
        );
        assert_eq!(new.remaps.len(), 2);
        assert!(new.remaps[0].day > 0.0);
        assert_eq!((new.rows[0].primary, new.rows[0].secondary), (1, 3));
    }
    #[test]
    fn equal_duration_prefers_fewer_remaps_then_later_first_remap() {
        let s = Schedule {
            days: 10.0,
            rows: vec![],
            installations: vec![],
            remaps: vec![Remap {
                day: 0.0,
                attributes: [27, 17, 17, 17, 21],
            }],
        };
        let mut delayed = s.clone();
        delayed.remaps[0].day = 5.0;
        assert!(better_schedule(&delayed, &s));
        let mut fewer = s.clone();
        fewer.remaps.clear();
        assert!(better_schedule(&fewer, &delayed));
        let mut faster = s.clone();
        faster.days = 9.0;
        assert!(better_schedule(&faster, &fewer));
    }
    #[test]
    fn early_round_trip_is_opt_in_and_reports_the_exact_extra_remap_gain() {
        let skills = [
            Skill {
                id: 1,
                name: "Ships".into(),
                rank: 15.0,
                primary: 1,
                secondary: 3,
                requirements: vec![],
            },
            Skill {
                id: 2,
                name: "Electronics".into(),
                rank: 4.0,
                primary: 0,
                secondary: 4,
                requirements: vec![],
            },
            Skill {
                id: CYBERNETICS,
                name: "Cybernetics".into(),
                rank: 3.0,
                primary: 0,
                secondary: 4,
                requirements: vec![],
            },
        ]
        .into_iter()
        .map(|s| (s.id, s))
        .collect();
        let mut p = plan(
            vec![
                model::Requirement { id: 1, level: 5 },
                model::Requirement { id: 2, level: 5 },
                model::Requirement {
                    id: CYBERNETICS,
                    level: 5,
                },
            ],
            2,
        );
        p.attributes = [17, 27, 17, 21, 17];
        p.implants = [4; 5];
        p.trained.insert(CYBERNETICS, model::sp(3.0, 4));
        p.optimize_implants = true;
        let (safe, offer) = optimize_personal(&p, &skills, false).unwrap();
        let offer = offer.expect("early implant upgrade should offer a faster round trip");
        let (fast, opt_in) = optimize_personal(&p, &skills, true).unwrap();
        assert_eq!(offer.conservative_remaps, 1);
        assert_eq!(offer.fastest_remaps, 2);
        assert!(safe.optimized.remaps[0].day > 0.0);
        assert_eq!(safe.optimized.rows[0].primary, 1);
        assert_eq!(fast.optimized.remaps[0].day, 0.0);
        assert_eq!(fast.optimized.remaps[1].attributes, p.attributes);
        assert!((safe.optimized.days - fast.optimized.days - offer.saved_days).abs() < 1e-8);
        assert_eq!(offer.saved_days, opt_in.unwrap().saved_days);
        assert_eq!(p.remap_count, 2);
    }
    #[test]
    fn a_plan_already_suited_to_current_attributes_has_no_extra_remap_offer() {
        let skills = priority_skills();
        let mut p = plan(vec![model::Requirement { id: 1, level: 4 }], 3);
        p.attributes = [27, 17, 17, 17, 21];
        let (result, offer) = optimize_personal(&p, &skills, false).unwrap();
        assert!(offer.is_none());
        assert!(result.optimized.remaps.is_empty());
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
