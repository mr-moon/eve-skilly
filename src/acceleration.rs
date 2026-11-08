//! Informational replay of a fixed queue; does not change its optimization.
use crate::optimizer::Schedule;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Accelerator {
    pub id: u32,
    pub name: String,
    pub bonus: f64,
    pub base_hours: f64,
    #[serde(default)]
    pub use_before: Option<i64>,
    #[serde(default)]
    pub requirements: Vec<crate::model::Requirement>,
}
pub fn catalog() -> Vec<Accelerator> {
    serde_json::from_str(include_str!("../assets/accelerators.json"))
        .expect("embedded accelerator catalog")
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub accelerator_id: u32,
    pub quantity: u32,
    pub custom: Option<Accelerator>,
    pub injector: String,
    pub use_unallocated: bool,
    pub biology_override: Option<u8>,
    pub total_sp_override: Option<u64>,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            accelerator_id: 77919,
            quantity: 1,
            custom: None,
            injector: "large".into(),
            use_unallocated: true,
            biology_override: None,
            total_sp_override: None,
        }
    }
}
#[derive(Clone, Debug, Default)]
pub struct Context {
    pub total_sp: u64,
    pub unallocated_sp: u64,
    pub biology: u8,
    pub duration_bonus: f64,
    pub science: u8,
}
impl Context {
    pub fn from_summary(value: &serde_json::Value) -> Result<Self, String> {
        Ok(Self {
            total_sp: value["total_sp"].as_u64().ok_or(
                "Обновите ESI и пересчитайте персонажа: в старом снимке нет общего количества SP",
            )?,
            unallocated_sp: value["unallocated_sp"].as_u64().unwrap_or(0),
            biology: value["biology_level"].as_u64().unwrap_or(0) as u8,
            duration_bonus: value["booster_duration_bonus"].as_f64().unwrap_or(0.0),
            science: value["science_level"].as_u64().unwrap_or(0) as u8,
        })
    }
}
#[derive(Clone, Debug, Serialize)]
pub struct InjectionSegment {
    pub count: u64,
    pub sp_each: u64,
    pub total_before: u64,
    pub total_after: u64,
}
#[derive(Clone, Debug, Serialize)]
pub struct Injection {
    pub count: u64,
    pub needed_sp: u64,
    pub unallocated_used: u64,
    pub received_sp: u64,
    pub excess_sp: u64,
    pub segments: Vec<InjectionSegment>,
}
pub fn injector_yield(total: u64, small: bool) -> u64 {
    let large = if total < 5_000_000 {
        500_000
    } else if total < 50_000_000 {
        400_000
    } else if total < 80_000_000 {
        300_000
    } else {
        150_000
    };
    if small {
        large / 5
    } else {
        large
    }
}
pub fn injectors(needed: u64, total: u64, free: u64, small: bool) -> Injection {
    let used = free.min(needed);
    let mut remaining = needed - used;
    let mut total_now = total;
    let mut segments = vec![];
    let mut received = 0;
    let mut count = 0;
    while remaining > 0 {
        let each = injector_yield(total_now, small);
        let limit = [5_000_000, 50_000_000, 80_000_000]
            .into_iter()
            .find(|n| *n > total_now);
        let tier_count = limit
            .map(|limit| (limit - total_now).div_ceil(each))
            .unwrap_or(u64::MAX);
        let n = remaining.div_ceil(each).min(tier_count);
        let sp = n * each;
        segments.push(InjectionSegment {
            count: n,
            sp_each: each,
            total_before: total_now,
            total_after: total_now + sp,
        });
        remaining = remaining.saturating_sub(sp);
        total_now += sp;
        received += sp;
        count += n;
    }
    Injection {
        count,
        needed_sp: needed,
        unallocated_used: used,
        received_sp: received,
        excess_sp: received.saturating_sub(needed - used),
        segments,
    }
}
#[derive(Clone, Debug, Serialize)]
pub struct Activation {
    pub start_day: f64,
    pub end_day: f64,
    pub biology: u8,
}
#[derive(Clone, Debug, Serialize)]
pub struct BoosterResult {
    pub accelerator: Accelerator,
    pub requested: u32,
    pub used: u32,
    pub unused: u32,
    pub days: f64,
    pub saved_days: f64,
    pub extra_sp: f64,
    pub activations: Vec<Activation>,
    pub row_end_days: Vec<f64>,
    pub expired: bool,
    pub unavailable: bool,
}
fn replay(
    schedule: &Schedule,
    accelerator: &Accelerator,
    quantity: u32,
    context: &Context,
    now_ms: i64,
) -> Result<BoosterResult, String> {
    let mut elapsed = 0.0;
    let mut until = 0.0;
    let mut used = 0;
    let mut biology = context.biology;
    let mut extra = 0.0;
    let mut activations = vec![];
    let mut ends = vec![];
    let mut expired = false;
    let mut known = BTreeMap::from([(3402, context.science), (3405, biology)]);
    for row in &schedule.rows {
        let duration = row.end_day - row.start_day;
        if !row.points.is_finite() || row.points <= 0.0 || !duration.is_finite() || duration <= 0.0
        {
            return Err("Очередь содержит некорректную длительность или SP".into());
        }
        let rate = row.points / duration;
        let mut points = row.points;
        while points > 1e-7 {
            if elapsed + 1e-10 >= until
                && used < quantity
                && accelerator
                    .requirements
                    .iter()
                    .all(|r| known.get(&r.id).copied().unwrap_or(0) >= r.level)
            {
                if accelerator.use_before.is_some_and(|deadline| {
                    now_ms as f64 + elapsed * 86_400_000.0 >= deadline as f64
                }) {
                    expired = true;
                } else {
                    until = elapsed
                        + accelerator.base_hours / 24.0
                            * (1.0 + 0.2 * biology as f64)
                            * (1.0 + context.duration_bonus / 100.0);
                    activations.push(Activation {
                        start_day: elapsed,
                        end_day: until,
                        biology,
                    });
                    used += 1;
                }
            }
            let boosted = elapsed + 1e-10 < until;
            let extra_rate = if boosted {
                accelerator.bonus * 1.5 * 1440.0
            } else {
                0.0
            };
            let next = if boosted {
                until - elapsed
            } else {
                f64::INFINITY
            };
            let time = (points / (rate + extra_rate)).min(next);
            points = (points - time * (rate + extra_rate)).max(0.0);
            extra += time * extra_rate;
            elapsed += time;
        }
        ends.push(elapsed);
        if row.id == 3405 {
            biology = biology.max(row.level);
        }
        known
            .entry(row.id)
            .and_modify(|level| *level = (*level).max(row.level))
            .or_insert(row.level);
    }
    Ok(BoosterResult {
        accelerator: accelerator.clone(),
        requested: quantity,
        used,
        unused: quantity - used,
        days: elapsed,
        saved_days: (schedule.days - elapsed).max(0.0),
        extra_sp: extra,
        activations,
        row_end_days: ends,
        expired,
        unavailable: quantity > 0
            && accelerator
                .requirements
                .iter()
                .any(|r| known.get(&r.id).copied().unwrap_or(0) < r.level),
    })
}
#[derive(Serialize)]
pub struct Checkpoint {
    pub skill: String,
    pub level: u8,
    pub day: f64,
    pub total_sp: u64,
    pub remaining_sp: u64,
    pub sp_each: u64,
    pub injectors: u64,
}
#[derive(Serialize)]
pub struct Report {
    pub original_days: f64,
    pub total_sp: u64,
    pub unallocated_sp: u64,
    pub biology: u8,
    pub duration_bonus: f64,
    pub selected: BoosterResult,
    pub comparisons: Vec<BoosterResult>,
    pub finish_now: Injection,
    pub checkpoints: Vec<Checkpoint>,
    pub injector: String,
}
fn ceil_sp(value: f64) -> u64 {
    (value.max(0.0) - 1e-7).max(0.0).ceil() as u64
}
pub fn analyze(
    schedule: &Schedule,
    mandatory: &Schedule,
    settings: &Settings,
    mut context: Context,
    now_ms: i64,
) -> Result<Report, String> {
    if settings.quantity > 10000
        || settings.biology_override.is_some_and(|n| n > 5)
        || !matches!(settings.injector.as_str(), "large" | "small")
    {
        return Err("Количество бустеров: 0–10000, Biology: 0–V, инжектор: Large или Small".into());
    }
    if !context.duration_bonus.is_finite() || !(0.0..=1000.0).contains(&context.duration_bonus) {
        return Err("Некорректный бонус длительности бустеров".into());
    }
    if let Some(total) = settings.total_sp_override {
        context.total_sp = total;
    }
    if context.total_sp > 1_000_000_000_000 || context.total_sp < context.unallocated_sp {
        return Err("Общие SP должны включать нераспределённые SP и не превышать 1 трлн".into());
    }
    if let Some(biology) = settings.biology_override {
        context.biology = biology;
    }
    let mut types = catalog();
    if settings.accelerator_id == 0 {
        let custom = settings
            .custom
            .as_ref()
            .ok_or("Укажите параметры ивентового бустера")?;
        if custom.name.trim().is_empty()
            || custom.name.len() > 200
            || !custom.bonus.is_finite()
            || custom.bonus <= 0.0
            || custom.bonus > 30.0
            || !custom.base_hours.is_finite()
            || custom.base_hours <= 0.0
            || custom.base_hours > 1000.0
        {
            return Err(
                "Свой бустер: бонус >0 и ≤30, базовая длительность >0 и ≤1000 часов".into(),
            );
        }
        types.push(custom.clone());
    }
    let accelerator = types
        .iter()
        .find(|t| t.id == settings.accelerator_id)
        .ok_or("Неизвестный cerebral accelerator")?;
    let selected = replay(schedule, accelerator, settings.quantity, &context, now_ms)?;
    let comparisons = types
        .iter()
        .map(|t| replay(schedule, t, settings.quantity, &context, now_ms))
        .collect::<Result<Vec<_>, _>>()?;
    let small = settings.injector == "small";
    let free = if settings.use_unallocated {
        context.unallocated_sp
    } else {
        0
    };
    let mut remaining: BTreeMap<(u32, u8), f64> = mandatory
        .rows
        .iter()
        .map(|r| ((r.id, r.level), r.points))
        .collect();
    let mut remaining_sp = remaining.values().sum::<f64>();
    if !remaining_sp.is_finite() || !(0.0..=1e12).contains(&remaining_sp) {
        return Err("Некорректное количество SP в целях".into());
    }
    let finish_now = injectors(ceil_sp(remaining_sp), context.total_sp, free, small);
    let mut checkpoints = vec![Checkpoint {
        skill: "Сейчас".into(),
        level: 0,
        day: 0.0,
        total_sp: context.total_sp,
        remaining_sp: ceil_sp(remaining_sp),
        sp_each: injector_yield(context.total_sp, small),
        injectors: finish_now.count,
    }];
    let mut trained = 0.0;
    for (index, row) in schedule.rows.iter().enumerate() {
        trained += row.points;
        if let Some(points) = remaining.remove(&(row.id, row.level)) {
            remaining_sp = (remaining_sp - points).max(0.0);
        }
        let total = context.total_sp + trained.floor() as u64;
        checkpoints.push(Checkpoint {
            skill: row.name.clone(),
            level: row.level,
            day: selected.row_end_days[index],
            total_sp: total,
            remaining_sp: ceil_sp(remaining_sp),
            sp_each: injector_yield(total, small),
            injectors: injectors(ceil_sp(remaining_sp), total, free, small).count,
        });
    }
    Ok(Report {
        original_days: schedule.days,
        total_sp: context.total_sp,
        unallocated_sp: context.unallocated_sp,
        biology: context.biology,
        duration_bonus: context.duration_bonus,
        selected,
        comparisons,
        finish_now,
        checkpoints,
        injector: settings.injector.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::optimizer::Row;
    fn schedule(points: f64, days: f64) -> Schedule {
        Schedule {
            days,
            rows: vec![Row {
                id: 3402,
                name: "Science".into(),
                level: 5,
                points,
                primary: 0,
                secondary: 4,
                start_day: 0.0,
                end_day: days,
            }],
            remaps: vec![],
            installations: vec![],
        }
    }
    #[test]
    fn injector_tiers_match_exact_boundaries_and_crossing_injector_keeps_its_full_yield() {
        assert_eq!(
            [4_999_999, 5_000_000, 49_999_999, 50_000_000, 79_999_999, 80_000_000]
                .map(|sp| injector_yield(sp, false)),
            [500_000, 400_000, 400_000, 300_000, 300_000, 150_000]
        );
        let result = injectors(900_000, 4_501_000, 0, false);
        assert_eq!(result.count, 2);
        assert_eq!(result.received_sp, 900_000);
        assert_eq!(
            result
                .segments
                .iter()
                .map(|s| s.sp_each)
                .collect::<Vec<_>>(),
            vec![500_000, 400_000]
        );
        assert_eq!(injector_yield(80_000_000, true), 30_000);
    }
    #[test]
    fn batched_injector_calculation_matches_sequential_consumption_across_all_tiers() {
        for start in [0, 4_999_999, 49_999_999, 79_999_999, 80_000_000] {
            for small in [false, true] {
                let needed = 90_123_456;
                let free = 123_456;
                let mut total = start;
                let mut got = free;
                let mut count = 0;
                while got < needed {
                    let yield_sp = injector_yield(total, small);
                    got += yield_sp;
                    total += yield_sp;
                    count += 1;
                }
                let result = injectors(needed, start, free, small);
                assert_eq!(result.count, count);
                assert_eq!(result.excess_sp, got - needed);
            }
        }
        let result = injectors(1_000_000, 5_100_000, 200_000, false);
        assert_eq!(result.count, 2);
        assert_eq!(result.unallocated_used, 200_000);
        assert_eq!(result.received_sp, 800_000);
    }
    #[test]
    fn finite_booster_ends_mid_level_and_biology_extends_each_activation() {
        let queue = schedule(432_000.0, 10.0);
        let settings = Settings {
            accelerator_id: 48582,
            quantity: 1,
            ..Settings::default()
        };
        let result = analyze(
            &queue,
            &queue,
            &settings,
            Context {
                science: 1,
                ..Context::default()
            },
            0,
        )
        .unwrap();
        assert!((result.selected.days - 9.5).abs() < 1e-9);
        assert!((result.selected.extra_sp - 21_600.0).abs() < 1e-6);
        let result = analyze(
            &queue,
            &queue,
            &settings,
            Context {
                biology: 5,
                science: 1,
                ..Context::default()
            },
            0,
        )
        .unwrap();
        assert!((result.selected.days - 9.0).abs() < 1e-9);
        let result = analyze(
            &queue,
            &queue,
            &Settings {
                quantity: 100,
                ..settings
            },
            Context {
                science: 1,
                ..Context::default()
            },
            0,
        )
        .unwrap();
        assert!((result.selected.days - 10.0 / 1.5).abs() < 1e-9);
        assert_eq!(result.selected.used, 7);
        assert_eq!(result.selected.unused, 93);
        assert_eq!(queue.days, 10.0);
    }
    #[test]
    fn boosters_wait_for_required_skill_instead_of_boosting_its_own_prerequisite() {
        let mut queue = schedule(432_000.0, 10.0);
        let initial = 250.0 / 43_200.0;
        queue.rows.insert(
            0,
            Row {
                id: 3402,
                name: "Science".into(),
                level: 1,
                points: 250.0,
                primary: 0,
                secondary: 4,
                start_day: 0.0,
                end_day: initial,
            },
        );
        queue.days += initial;
        let report = analyze(
            &queue,
            &queue,
            &Settings {
                accelerator_id: 48582,
                quantity: 1,
                ..Settings::default()
            },
            Context::default(),
            0,
        )
        .unwrap();
        assert!((report.selected.activations[0].start_day - initial).abs() < 1e-10);
        assert!((report.selected.days - initial - 9.5).abs() < 1e-9);
    }
    #[test]
    fn biology_training_changes_only_future_doses_and_expired_units_are_not_consumed() {
        let mut queue = schedule(864_000.0, 20.0);
        queue.rows.insert(
            0,
            Row {
                id: 3405,
                name: "Biology".into(),
                level: 1,
                points: 250.0,
                primary: 0,
                secondary: 4,
                start_day: 0.0,
                end_day: 250.0 / 43_200.0,
            },
        );
        queue.days += 250.0 / 43_200.0;
        let settings = Settings {
            accelerator_id: 48582,
            quantity: 2,
            ..Settings::default()
        };
        let result = analyze(
            &queue,
            &queue,
            &settings,
            Context {
                science: 1,
                ..Context::default()
            },
            0,
        )
        .unwrap();
        let acts = &result.selected.activations;
        assert_eq!(acts[0].biology, 0);
        assert_eq!(acts[1].biology, 1);
        assert!((acts[0].end_day - acts[0].start_day - 1.0).abs() < 1e-9);
        assert!((acts[1].end_day - acts[1].start_day - 1.2).abs() < 1e-9);
        let settings = Settings {
            accelerator_id: 0,
            quantity: 10,
            custom: Some(Accelerator {
                id: 0,
                name: "Event test".into(),
                bonus: 10.0,
                base_hours: 24.0,
                use_before: Some(129_600_000),
                requirements: vec![],
            }),
            ..Settings::default()
        };
        let queue = schedule(864_000.0, 20.0);
        let result = analyze(
            &queue,
            &queue,
            &settings,
            Context {
                science: 1,
                ..Context::default()
            },
            0,
        )
        .unwrap();
        assert_eq!(result.selected.used, 2);
        assert_eq!(result.selected.unused, 8);
        assert!(result.selected.expired);
    }
    #[test]
    fn injector_progress_counts_natural_training_and_omits_optional_cybernetics_from_targets() {
        let mandatory = schedule(1_000_000.0, 20.0);
        let mut queue = mandatory.clone();
        queue.rows.insert(
            0,
            Row {
                id: 3411,
                name: "Cybernetics".into(),
                level: 5,
                points: 300_000.0,
                primary: 0,
                secondary: 4,
                start_day: 0.0,
                end_day: 10.0,
            },
        );
        queue.days += 10.0;
        let result = analyze(
            &queue,
            &mandatory,
            &Settings {
                quantity: 0,
                ..Settings::default()
            },
            Context {
                total_sp: 4_800_000,
                ..Context::default()
            },
            0,
        )
        .unwrap();
        assert_eq!(result.finish_now.needed_sp, 1_000_000);
        assert_eq!(result.checkpoints[0].sp_each, 500_000);
        assert_eq!(result.checkpoints[1].sp_each, 400_000);
        assert_eq!(result.checkpoints[1].remaining_sp, 1_000_000);
        assert_eq!(result.checkpoints[2].injectors, 0);
    }
}
