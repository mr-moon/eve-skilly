use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;

const LATEST_API: &str = "https://api.github.com/repos/mr-moon/eve-skilly/releases/latest";
const DOWNLOAD_PAGE: &str = "https://github.com/mr-moon/eve-skilly/releases/latest";

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    draft: bool,
    prerelease: bool,
}

fn version(value: &str) -> Option<[u64; 3]> {
    let value = value.strip_prefix('v').unwrap_or(value);
    let value = value.split('+').next()?;
    let parts: Vec<u64> = value.split('.').map(|part| {
        if part.is_empty() || !part.bytes().all(|c| c.is_ascii_digit()) {
            return None;
        }
        part.parse().ok()
    }).collect::<Option<_>>()?;
    parts.try_into().ok()
}

fn available(current: &str, release: Release) -> Option<Value> {
    if release.draft || release.prerelease || version(&release.tag_name)? <= version(current)? {
        return None;
    }
    Some(json!({"version":release.tag_name.trim_start_matches('v')}))
}

pub fn check(current: &str) -> Result<Option<Value>, String> {
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(8))
        .user_agent(format!("Skilly/{current}"))
        .build().map_err(|e| e.to_string())?;
    let release = client.get(LATEST_API)
        .header("Accept", "application/vnd.github+json")
        .send().and_then(|r| r.error_for_status())
        .and_then(|r| r.json::<Release>()).map_err(|e| e.to_string())?;
    Ok(available(current, release))
}

pub fn open_download_page() {
    crate::server::open_browser(DOWNLOAD_PAGE);
}

#[cfg(test)]
mod tests {
    use super::*;
    fn release(tag: &str) -> Release {
        Release { tag_name:tag.into(), draft:false, prerelease:false }
    }
    #[test]
    fn only_newer_stable_releases_are_offered() {
        assert!(available("0.13.1",release("v0.13.1")).is_none());
        assert!(available("0.13.1",release("v0.12.9")).is_none());
        assert_eq!(available("0.9.9",release("v0.13.1")).unwrap()["version"],"0.13.1");
        assert!(available("0.13.1",release("v0.13.10")).is_some());
        assert!(available("0.13.1",release("v1.0.0")).is_some());
        assert!(available("0.13.1",release("v0.14.0-beta.1")).is_none());
        let mut hidden = release("v0.14.0"); hidden.draft=true;
        assert!(available("0.13.1",hidden).is_none());
        let mut preview = release("v0.14.0"); preview.prerelease=true;
        assert!(available("0.13.1",preview).is_none());
        assert!(available("0.13.1",release("unexpected")).is_none());
    }
}
