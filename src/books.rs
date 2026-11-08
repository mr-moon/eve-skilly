use crate::storage::{now_ms, write_json};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::PathBuf,
    sync::Mutex,
    time::Duration,
};

const STATION: u64 = 60_003_760;
const TTL: u64 = 1_800_000;
#[derive(Clone, Default, Serialize, Deserialize)]
struct Quote {
    price: Option<f64>,
    checked_at: u64,
}
#[derive(Serialize, Deserialize)]
struct JitaCache {
    station: u64,
    quotes: BTreeMap<u32, Quote>,
}
impl Default for JitaCache {
    fn default() -> Self {
        Self {
            station: STATION,
            quotes: BTreeMap::new(),
        }
    }
}
pub struct BookPrices {
    path: PathBuf,
    market: Mutex<JitaCache>,
}
#[derive(Clone, Debug, Serialize)]
pub struct BookRow {
    pub id: u32,
    pub name: String,
    pub price: Option<f64>,
    pub checked_at: u64,
}
#[derive(Clone, Debug, Serialize)]
pub struct BookReport {
    pub required: usize,
    pub already_injected: usize,
    pub total: f64,
    pub missing: usize,
    pub rows: Vec<BookRow>,
    pub station: u64,
    pub fetched_at: u64,
    pub warnings: Vec<String>,
}
fn percentile(value: &serde_json::Value) -> Option<f64> {
    let sell = value.get("sell")?;
    let number = |v: &serde_json::Value| {
        v.as_f64()
            .or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok()))
    };
    if sell
        .get("volume")
        .and_then(number)
        .is_some_and(|n| n <= 0.0)
    {
        return None;
    }
    sell.get("percentile")
        .and_then(number)
        .filter(|v| v.is_finite() && *v > 0.0 && *v < 1e15)
        .map(|v| (v * 100.0).round() / 100.0)
}
impl BookPrices {
    pub fn new(path: PathBuf) -> Self {
        let market = std::fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<JitaCache>(&bytes).ok())
            .filter(|cache| cache.station == STATION)
            .unwrap_or_default();
        Self {
            path,
            market: Mutex::new(market),
        }
    }
    fn fetch(ids: &[u32]) -> Result<BTreeMap<u32, Quote>, String> {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::none())
            .user_agent("Skilly/0.6.0 Jita skillbook estimates")
            .build()
            .map_err(|e| e.to_string())?;
        let types = ids.iter().map(u32::to_string).collect::<Vec<_>>().join(",");
        let response = client
            .get("https://market.fuzzwork.co.uk/aggregates/")
            .query(&[("station", STATION.to_string()), ("types", types)])
            .send()
            .map_err(|_| "Не удалось получить цены Jita 4-4")?;
        if !response.status().is_success() {
            return Err(format!("Цены Jita: HTTP {}", response.status().as_u16()));
        }
        let values: serde_json::Value =
            response.json().map_err(|_| "Некорректный ответ цен Jita")?;
        if !values.is_object() {
            return Err("Некорректный формат цен Jita".into());
        }
        let time = now_ms();
        Ok(ids
            .iter()
            .map(|&id| {
                (
                    id,
                    Quote {
                        price: values.get(id.to_string()).and_then(percentile),
                        checked_at: time,
                    },
                )
            })
            .collect())
    }
    pub fn quote(
        &self,
        ids: &[u32],
        injected: &BTreeSet<u32>,
        refresh: bool,
    ) -> Result<BookReport, String> {
        if ids.len() > 2000 {
            return Err("Слишком много книг".into());
        }
        let all: BTreeSet<u32> = ids.iter().copied().collect();
        let wanted: Vec<u32> = all.difference(injected).copied().collect();
        let mut market = self.market.lock().map_err(|e| e.to_string())?;
        let mut warnings = vec![];
        let stale: Vec<_> = wanted
            .iter()
            .copied()
            .filter(|id| {
                refresh
                    || market
                        .quotes
                        .get(id)
                        .is_none_or(|q| now_ms().saturating_sub(q.checked_at) >= TTL)
            })
            .collect();
        let mut changed = false;
        for batch in stale.chunks(100) {
            match Self::fetch(batch){
                Ok(next)=>{market.quotes.extend(next);changed=true;}
                Err(error)=>warnings.push(format!("{error}. Используем сохранённые цены Jita; неизвестные цены не считаются нулевыми.")),
            }
        }
        if changed {
            if let Err(error) = write_json(&self.path, &*market) {
                warnings.push(format!("Не удалось сохранить кэш цен: {error}"));
            }
        }
        let mut report = quote_rows(&wanted, &market);
        report.already_injected = all.len() - wanted.len();
        report.warnings = warnings;
        Ok(report)
    }
}
fn quote_rows(ids: &[u32], market: &JitaCache) -> BookReport {
    let rows: Vec<_> = ids
        .iter()
        .map(|&id| {
            let quote = market.quotes.get(&id);
            BookRow {
                id,
                name: format!("Type #{id}"),
                price: quote
                    .and_then(|q| q.price)
                    .filter(|v| v.is_finite() && *v > 0.0 && *v < 1e15),
                checked_at: quote.map_or(0, |q| q.checked_at),
            }
        })
        .collect();
    BookReport {
        required: rows.len(),
        already_injected: 0,
        total: rows.iter().filter_map(|r| r.price).sum(),
        missing: rows.iter().filter(|r| r.price.is_none()).count(),
        station: STATION,
        fetched_at: rows
            .iter()
            .map(|r| r.checked_at)
            .filter(|&time| time > 0)
            .min()
            .unwrap_or(0),
        rows,
        warnings: vec![],
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn one_book_per_skill_and_zero_sp_injected_skills_do_not_need_books() {
        let cache = JitaCache {
            station: STATION,
            quotes: BTreeMap::from([
                (
                    3402,
                    Quote {
                        price: Some(7.0),
                        checked_at: now_ms(),
                    },
                ),
                (
                    3411,
                    Quote {
                        price: Some(11.0),
                        checked_at: now_ms(),
                    },
                ),
            ]),
        };
        let prices = BookPrices {
            path: PathBuf::from("target/test-book-cache-unused.json"),
            market: Mutex::new(cache),
        };
        let personal = prices
            .quote(&[3402, 3402, 3411, 3411], &BTreeSet::from([3402]), false)
            .unwrap();
        assert_eq!(personal.required, 1);
        assert_eq!(personal.already_injected, 1);
        assert_eq!(personal.total, 11.0);
        let global = prices
            .quote(&[3402, 3402, 3411], &BTreeSet::new(), false)
            .unwrap();
        assert_eq!(global.required, 2);
        assert_eq!(global.total, 18.0);
    }
    #[test]
    fn price_uses_sell_percentile_instead_of_buy_minimum_or_other_reference() {
        let value = serde_json::json!({"buy":{"percentile":"999"},"sell":{"min":"10","percentile":"23.456","volume":"100"}});
        assert_eq!(percentile(&value), Some(23.46));
        assert_eq!(
            percentile(&serde_json::json!({"sell":{"percentile":"0","volume":"0"}})),
            None
        );
        assert_eq!(
            percentile(&serde_json::json!({"sell":{"percentile":20,"volume":0}})),
            None
        );
    }
    #[test]
    fn unknown_prices_are_partial_without_fallback_to_other_locations_or_npc_values() {
        let cache = JitaCache {
            station: STATION,
            quotes: BTreeMap::from([(
                3402,
                Quote {
                    price: Some(10.0),
                    checked_at: 1,
                },
            )]),
        };
        let report = quote_rows(&[3402, 3411], &cache);
        assert_eq!(report.missing, 1);
        assert_eq!(report.total, 10.0);
        assert_eq!(report.rows[1].price, None);
        assert_eq!(report.station, 60_003_760);
    }
}
