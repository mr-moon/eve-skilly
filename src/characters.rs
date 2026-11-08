use crate::{
    model::{self, Plan},
    optimizer::{self, Comparison},
    storage::{calculation_key, now_ms, write_json},
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{DateTime, Utc};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

pub const CALLBACK: &str = "http://127.0.0.1:17422/sso/callback";
pub const SCOPES: [&str; 3] = [
    "esi-skills.read_skills.v1",
    "esi-skills.read_skillqueue.v1",
    "esi-clones.read_implants.v1",
];
const ESI: &str = "https://esi.evetech.net";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CharacterImplant {
    pub id: u32,
    pub name: String,
    pub slot: u8,
    pub bonuses: [u8; 5],
    #[serde(default)]
    pub booster_duration_bonus: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CharacterSnapshot {
    pub id: u64,
    pub name: String,
    pub fetched_at: u64,
    pub trained: BTreeMap<u32, f64>,
    pub attributes: [u8; 5],
    pub implants: Vec<CharacterImplant>,
    pub bonuses: [u8; 5],
    pub remap_count: u8,
    pub bonus_remaps: u8,
    pub next_remap: Option<String>,
    pub unallocated_sp: u64,
    pub warnings: Vec<String>,
}
impl CharacterSnapshot {
    pub fn summary(&self) -> Value {
        let total_sp =
            (self.trained.values().sum::<f64>().floor() as u64).saturating_add(self.unallocated_sp);
        let biology_points = self.trained.get(&3405).copied().unwrap_or(0.0);
        let biology_level = (0..=5)
            .rev()
            .find(|level| biology_points >= model::sp(1.0, *level))
            .unwrap_or(0);
        let science_points = self.trained.get(&3402).copied().unwrap_or(0.0);
        let science_level = (0..=5)
            .rev()
            .find(|level| science_points >= model::sp(1.0, *level))
            .unwrap_or(0);
        // Known IDs also cover cached implant records created before this field existed.
        let duration_bonus = self
            .implants
            .iter()
            .map(|i| {
                i.booster_duration_bonus.max(match i.id {
                    27147 => 5.0,
                    27148 => 10.0,
                    _ => 0.0,
                })
            })
            .fold(0.0, f64::max);
        json!({"id":self.id,"name":self.name,"fetched_at":self.fetched_at,"attributes":self.attributes,
            "implants":self.implants,"bonuses":self.bonuses,"remap_count":self.remap_count,
            "bonus_remaps":self.bonus_remaps,"next_remap":self.next_remap,
            "unallocated_sp":self.unallocated_sp,"warnings":self.warnings,"skill_count":self.trained.len(),
            "total_sp":total_sp,"biology_level":biology_level,"booster_duration_bonus":duration_bonus,"science_level":science_level,
            "injected_skill_ids":self.trained.keys().copied().collect::<Vec<_>>()})
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Adaptation {
    pub character_id: u64,
    pub character_name: String,
    pub source_key: String,
    pub snapshot_at: u64,
    pub computed_at: u64,
    pub remap_count: u8,
    pub replace_implants: bool,
    pub completed_levels: usize,
    pub character: Value,
    pub comparison: Comparison,
}
pub fn adapt(
    plan: &Plan,
    snapshot: &CharacterSnapshot,
    skills: &BTreeMap<u32, model::Skill>,
    replace_implants: bool,
    remap_override: Option<u8>,
) -> Result<Adaptation, String> {
    let global = plan.clone().start_from_scratch();
    let all_levels = model::jobs(&global, skills)?.len();
    let mut personal = global.clone();
    personal.trained = snapshot.trained.clone();
    personal.attributes = snapshot.attributes;
    personal.implants = snapshot.bonuses;
    // Personal purchases are controlled by occupied-slot replacement permission,
    // independently of the shared plan's from-scratch purchase setting.
    personal.optimize_implants = true;
    personal.remap_count = remap_override.unwrap_or(snapshot.remap_count);
    for implant in &snapshot.implants {
        if (1..=5).contains(&implant.slot) && !replace_implants {
            personal.locked_implants[[1, 4, 3, 0, 2][(implant.slot - 1) as usize]] = true;
        }
    }
    let remaining = model::jobs(&personal, skills)?.len();
    let comparison = optimizer::optimize(&personal, skills)?;
    Ok(Adaptation {
        character_id: snapshot.id,
        character_name: snapshot.name.clone(),
        source_key: calculation_key(&global),
        snapshot_at: snapshot.fetched_at,
        computed_at: now_ms(),
        remap_count: personal.remap_count,
        replace_implants,
        completed_levels: all_levels.saturating_sub(remaining),
        character: snapshot.summary(),
        comparison,
    })
}

#[derive(Clone, Default, Serialize, Deserialize)]
struct Config {
    client_id: String,
}
#[derive(Clone, Serialize, Deserialize)]
struct Credentials {
    refresh_token: String,
    client_id: String,
}
#[derive(Clone, Default, Serialize)]
struct LoginStatus {
    phase: String,
    message: String,
    character_id: Option<u64>,
}
pub struct CharacterService {
    root: PathBuf,
    client: Client,
    config: Mutex<Config>,
    snapshots: Mutex<BTreeMap<u64, CharacterSnapshot>>,
    login: Mutex<LoginStatus>,
}
#[derive(Deserialize)]
struct Token {
    access_token: String,
    #[serde(default)]
    refresh_token: String,
}
#[derive(Deserialize)]
struct Metadata {
    authorization_endpoint: String,
    token_endpoint: String,
    jwks_uri: String,
}
#[derive(Clone, Deserialize)]
struct Claims {
    sub: String,
    name: String,
    azp: Option<String>,
    scp: Value,
}

impl CharacterService {
    pub fn new(root: PathBuf) -> Result<Arc<Self>, String> {
        let mut config: Config = if root.join("sso.json").exists() {
            serde_json::from_slice(
                &std::fs::read(root.join("sso.json")).map_err(|e| e.to_string())?,
            )
            .map_err(|e| format!("SSO config: {e}"))?
        } else {
            Config::default()
        };
        if config.client_id.is_empty() {
            let id = std::env::var("EVE_CLIENT_ID").ok().or_else(|| {
                let mut files = vec![
                    PathBuf::from(".env"),
                    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".env"),
                ];
                if let Ok(exe) = std::env::current_exe() {
                    if let Some(parent) = exe.parent() {
                        files.push(parent.join(".env"));
                    }
                }
                files
                    .into_iter()
                    .filter_map(|p| std::fs::read_to_string(p).ok())
                    .find_map(|text| dotenv_client_id(&text))
            });
            if let Some(id) = id.filter(|id| {
                !id.is_empty()
                    && id.len() <= 100
                    && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
            }) {
                config.client_id = id;
                write_json(&root.join("sso.json"), &config)?;
            }
        }
        let snapshots = if root.join("characters.json").exists() {
            serde_json::from_slice(
                &std::fs::read(root.join("characters.json")).map_err(|e| e.to_string())?,
            )
            .map_err(|e| format!("Снимки персонажей: {e}"))?
        } else {
            BTreeMap::new()
        };
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::none())
            .user_agent("Skilly/0.3.0 (local EVE skill planner)")
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Arc::new(Self {
            root,
            client,
            config: Mutex::new(config),
            snapshots: Mutex::new(snapshots),
            login: Mutex::new(LoginStatus::default()),
        }))
    }
    pub fn state(&self) -> Result<Value, String> {
        let config = self.config.lock().map_err(|e| e.to_string())?.clone();
        let snapshots = self.snapshots.lock().map_err(|e| e.to_string())?;
        Ok(
            json!({"client_id":config.client_id,"callback":CALLBACK,"scopes":SCOPES,
            "characters":snapshots.values().map(CharacterSnapshot::summary).collect::<Vec<_>>(),
            "login":*self.login.lock().map_err(|e|e.to_string())?}),
        )
    }
    pub fn configure(&self, client_id: &str) -> Result<(), String> {
        let id = client_id.trim();
        if id.is_empty()
            || id.len() > 100
            || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        {
            return Err("Укажите Client ID приложения CCP, без Client Secret".into());
        }
        let mut config = self.config.lock().map_err(|e| e.to_string())?;
        let next = Config {
            client_id: id.into(),
        };
        write_json(&self.root.join("sso.json"), &next)?;
        *config = next;
        Ok(())
    }
    pub fn snapshot(&self, id: u64) -> Result<CharacterSnapshot, String> {
        self.snapshots
            .lock()
            .map_err(|e| e.to_string())?
            .get(&id)
            .cloned()
            .ok_or("Персонаж не подключён".into())
    }
    fn status(&self, phase: &str, message: &str, id: Option<u64>) {
        if let Ok(mut status) = self.login.lock() {
            *status = LoginStatus {
                phase: phase.into(),
                message: message.into(),
                character_id: id,
            };
        }
    }
    fn metadata(&self) -> Result<Metadata, String> {
        let meta: Metadata = self.json(
            self.client
                .get("https://login.eveonline.com/.well-known/oauth-authorization-server"),
        )?;
        for endpoint in [
            &meta.authorization_endpoint,
            &meta.token_endpoint,
            &meta.jwks_uri,
        ] {
            let url = url::Url::parse(endpoint).map_err(|_| "Некорректный endpoint EVE SSO")?;
            if url.scheme() != "https" || url.host_str() != Some("login.eveonline.com") {
                return Err("Неожиданный endpoint EVE SSO".into());
            }
        }
        Ok(meta)
    }
    fn json<T: serde::de::DeserializeOwned>(
        &self,
        request: reqwest::blocking::RequestBuilder,
    ) -> Result<T, String> {
        let response = request
            .send()
            .map_err(|_| "Не удалось связаться с EVE SSO / ESI. Проверьте интернет.".to_string())?;
        let code = response.status();
        if !code.is_success() {
            return Err(format!(
                "EVE SSO / ESI: HTTP {}{}",
                code.as_u16(),
                if code.as_u16() == 401 || code.as_u16() == 403 {
                    ". Подключите персонажа заново."
                } else {
                    ". Попробуйте обновить позднее."
                }
            ));
        }
        response
            .json()
            .map_err(|_| "Некорректный ответ EVE SSO / ESI".into())
    }
    fn verify(
        &self,
        token: &str,
        client_id: &str,
        metadata: &Metadata,
    ) -> Result<(u64, String), String> {
        use jsonwebtoken::{
            decode, decode_header, jwk::JwkSet, Algorithm, DecodingKey, Validation,
        };
        let header = decode_header(token).map_err(|_| "Некорректный токен EVE SSO")?;
        if header.alg != Algorithm::RS256 {
            return Err("Неподдерживаемая подпись EVE SSO".into());
        }
        let keys: JwkSet = self.json(self.client.get(&metadata.jwks_uri))?;
        let jwk = keys
            .find(header.kid.as_deref().ok_or("В токене отсутствует kid")?)
            .ok_or("Неизвестный ключ EVE SSO")?;
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_audience(&["EVE Online"]);
        validation.set_issuer(&["https://login.eveonline.com", "logineveonline.com"]);
        let claims = decode::<Claims>(
            token,
            &DecodingKey::from_jwk(jwk).map_err(|_| "Ключ EVE SSO повреждён")?,
            &validation,
        )
        .map_err(|_| "Подпись или срок действия токена EVE SSO недействительны")?
        .claims;
        if claims.azp.as_deref() != Some(client_id) {
            return Err("Токен предназначен другому приложению".into());
        }
        let granted: Vec<&str> = match &claims.scp {
            Value::Array(v) => v.iter().filter_map(Value::as_str).collect(),
            Value::String(s) => s.split_whitespace().collect(),
            _ => vec![],
        };
        if SCOPES.iter().any(|scope| !granted.contains(scope)) {
            return Err("Разрешите чтение навыков, очереди и имплантов в EVE SSO".into());
        }
        let id = claims
            .sub
            .strip_prefix("CHARACTER:EVE:")
            .and_then(|s| s.parse().ok())
            .filter(|id: &u64| *id > 0)
            .ok_or("Нет Character ID в EVE SSO")?;
        Ok((id, claims.name))
    }
    fn token_path(&self, id: u64) -> PathBuf {
        self.root.join("credentials").join(format!("{id}.json"))
    }
    fn save_token(&self, id: u64, credentials: &Credentials) -> Result<(), String> {
        let bytes = serde_json::to_vec(credentials).map_err(|e| e.to_string())?;
        let encrypted = crate::secrets::protect(&bytes, false)?;
        write_json(&self.token_path(id), &URL_SAFE_NO_PAD.encode(encrypted))
    }
    fn read_token(&self, id: u64) -> Result<Credentials, String> {
        let encoded: String = serde_json::from_slice(
            &std::fs::read(self.token_path(id))
                .map_err(|_| "Нет доступа к персонажу. Подключите его заново.")?,
        )
        .map_err(|_| "Повреждено хранилище токенов")?;
        let bytes = URL_SAFE_NO_PAD
            .decode(encoded)
            .map_err(|_| "Повреждено хранилище токенов")?;
        serde_json::from_slice(&crate::secrets::protect(&bytes, true)?)
            .map_err(|_| "Не удалось прочитать токен".into())
    }
    pub fn sync(&self, id: u64) -> Result<CharacterSnapshot, String> {
        // Serialize refresh rotation for this application instance.
        let _guard = REFRESH_LOCK.lock().map_err(|e| e.to_string())?;
        let mut credentials = self.read_token(id)?;
        let metadata = self.metadata()?;
        let token: Token = self.json(self.client.post(&metadata.token_endpoint).form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", credentials.refresh_token.as_str()),
            ("client_id", credentials.client_id.as_str()),
        ]))?;
        let (verified_id, name) =
            self.verify(&token.access_token, &credentials.client_id, &metadata)?;
        if verified_id != id {
            return Err("SSO вернул другого персонажа".into());
        }
        if !token.refresh_token.is_empty() {
            credentials.refresh_token = token.refresh_token;
            self.save_token(id, &credentials)?;
        }
        self.download(id, name, &token.access_token)
    }
    pub fn begin(self: &Arc<Self>) -> Result<String, String> {
        let client_id = self
            .config
            .lock()
            .map_err(|e| e.to_string())?
            .client_id
            .clone();
        if client_id.is_empty() {
            return Err("Сначала укажите Client ID приложения CCP".into());
        }
        let listener=TcpListener::bind("127.0.0.1:17422").map_err(|_|"Порт callback 17422 занят. Дождитесь завершения предыдущего подключения или закройте второе окно Skilly.")?;
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
        let meta = self.metadata()?;
        let verifier = random_string()?;
        let state = random_string()?;
        let mut url = url::Url::parse(&meta.authorization_endpoint).map_err(|e| e.to_string())?;
        url.query_pairs_mut().extend_pairs([
            ("response_type", "code"),
            ("client_id", client_id.as_str()),
            ("redirect_uri", CALLBACK),
            ("scope", SCOPES.join(" ").as_str()),
            ("state", state.as_str()),
            (
                "code_challenge",
                URL_SAFE_NO_PAD
                    .encode(Sha256::digest(verifier.as_bytes()))
                    .as_str(),
            ),
            ("code_challenge_method", "S256"),
        ]);
        let service = self.clone();
        self.status(
            "waiting",
            "Завершите подключение персонажа в браузере",
            None,
        );
        std::thread::spawn(move || {
            let result = service.wait_callback(listener, &state, &verifier, &client_id, &meta);
            match result {
                Ok(id) => service.status("connected", "Персонаж подключён", Some(id)),
                Err(error) => service.status("error", &error, None),
            }
        });
        crate::server::open_browser(url.as_str());
        Ok(url.into())
    }
    fn wait_callback(
        &self,
        listener: TcpListener,
        state: &str,
        verifier: &str,
        client_id: &str,
        meta: &Metadata,
    ) -> Result<u64, String> {
        let deadline = Instant::now() + Duration::from_secs(300);
        while Instant::now() < deadline {
            let (mut stream, _) = match listener.accept() {
                Ok(s) => s,
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(150));
                    continue;
                }
                Err(e) => return Err(e.to_string()),
            };
            let query = match callback_query(&mut stream, state) {
                Ok(q) => q,
                Err(_) => {
                    callback_response(&mut stream, false);
                    continue;
                }
            };
            if query.contains_key("error") {
                callback_response(&mut stream, false);
                return Err("Подключение отменено в EVE SSO".into());
            }
            let Some(code) = query.get("code") else {
                callback_response(&mut stream, false);
                continue;
            };
            self.status(
                "loading",
                "Читаем навыки, импланты и атрибуты персонажа…",
                None,
            );
            let result = (|| {
                let token: Token = self.json(self.client.post(&meta.token_endpoint).form(&[
                    ("grant_type", "authorization_code"),
                    ("client_id", client_id),
                    ("code", code.as_str()),
                    ("code_verifier", verifier),
                    ("redirect_uri", CALLBACK),
                ]))?;
                let (id, name) = self.verify(&token.access_token, client_id, meta)?;
                if token.refresh_token.is_empty() {
                    return Err("EVE SSO не вернул refresh token".into());
                }
                self.save_token(
                    id,
                    &Credentials {
                        refresh_token: token.refresh_token,
                        client_id: client_id.into(),
                    },
                )?;
                self.download(id, name, &token.access_token)?;
                Ok(id)
            })();
            callback_response(&mut stream, result.is_ok());
            return result;
        }
        Err("Время подключения истекло. Нажмите «Подключить персонажа» ещё раз.".into())
    }
    fn esi<T: serde::de::DeserializeOwned>(&self, path: &str, token: &str) -> Result<T, String> {
        self.json(
            self.client
                .get(format!("{ESI}{path}"))
                .header("X-Compatibility-Date", "2026-11-04")
                .bearer_auth(token),
        )
    }
    fn download(&self, id: u64, name: String, token: &str) -> Result<CharacterSnapshot, String> {
        let skill_data: SkillsResponse = self.esi(&format!("/characters/{id}/skills"), token)?;
        let attributes: AttributesResponse =
            self.esi(&format!("/characters/{id}/attributes"), token)?;
        let ids: Vec<u32> = self.esi(&format!("/characters/{id}/implants"), token)?;
        let queue: Vec<QueueEntry> = self.esi(&format!("/characters/{id}/skillqueue"), token)?;
        let mut implants = vec![];
        for implant_id in ids {
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
            let typ: Type = self.json(
                self.client
                    .get(format!("{ESI}/universe/types/{implant_id}"))
                    .header("X-Compatibility-Date", "2026-11-04")
                    .header("Accept-Language", "en"),
            )?;
            let dogma: BTreeMap<_, _> = typ
                .dogma_attributes
                .iter()
                .map(|v| (v.attribute_id, v.value))
                .collect();
            let bonuses = [176, 178, 175, 179, 177]
                .map(|id| dogma.get(&id).copied().unwrap_or(0.0).clamp(0.0, 5.0) as u8);
            implants.push(CharacterImplant {
                id: implant_id,
                name: typ.name,
                slot: dogma.get(&331).copied().unwrap_or(0.0) as u8,
                bonuses,
                booster_duration_bonus: dogma.get(&66).copied().unwrap_or(0.0),
            });
        }
        let snapshot = build_snapshot(
            id,
            name,
            skill_data,
            attributes,
            implants,
            queue,
            Utc::now(),
        )?;
        let mut snapshots = self.snapshots.lock().map_err(|e| e.to_string())?;
        let mut next = snapshots.clone();
        next.insert(id, snapshot.clone());
        write_json(&self.root.join("characters.json"), &next)?;
        *snapshots = next;
        Ok(snapshot)
    }
}
static REFRESH_LOCK: Mutex<()> = Mutex::new(());
fn random_string() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| "Не удалось получить случайные данные")?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}
fn callback_query(stream: &mut TcpStream, state: &str) -> Result<BTreeMap<String, String>, String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(3)))
        .map_err(|e| e.to_string())?;
    let mut request = vec![];
    let mut buffer = [0; 1024];
    while !request.windows(4).any(|w| w == b"\r\n\r\n") {
        let n = stream.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 || request.len() + n > 8192 {
            return Err("Некорректный callback".into());
        }
        request.extend_from_slice(&buffer[..n]);
    }
    parse_callback(
        std::str::from_utf8(&request).map_err(|_| "Некорректный callback")?,
        state,
    )
}
fn parse_callback(request: &str, state: &str) -> Result<BTreeMap<String, String>, String> {
    let mut lines = request.split("\r\n");
    let first = lines.next().unwrap_or("");
    let parts: Vec<_> = first.split_whitespace().collect();
    if parts.len() != 3 || parts[0] != "GET" || !parts[1].starts_with("/sso/callback?") {
        return Err("Некорректный callback".into());
    }
    let host = lines
        .filter_map(|l| l.split_once(':'))
        .find(|(k, _)| k.eq_ignore_ascii_case("host"))
        .map(|(_, v)| v.trim());
    if host != Some("127.0.0.1:17422") {
        return Err("Некорректный Host callback".into());
    }
    let url = url::Url::parse(&format!("http://127.0.0.1:17422{}", parts[1]))
        .map_err(|_| "Некорректный callback")?;
    let mut query = BTreeMap::new();
    for (key, value) in url.query_pairs() {
        if query.insert(key.into_owned(), value.into_owned()).is_some() {
            return Err("Повторный параметр callback".into());
        }
    }
    if query.get("state").map(String::as_str) != Some(state) {
        return Err("Состояние SSO не совпадает".into());
    }
    Ok(query)
}
fn callback_response(stream: &mut TcpStream, ok: bool) {
    let body = if ok {
        "Skilly: character connected. You can close this tab and return to Skilly."
    } else {
        "Skilly: connection not completed. Return to the application for details."
    };
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    let _=write!(stream,"HTTP/1.1 {}\r\nContent-Type: text/plain; charset=utf-8\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",if ok{"200 OK"}else{"400 Bad Request"},body.len(),body);
}
#[derive(Deserialize)]
struct SkillEntry {
    skill_id: u32,
    skillpoints_in_skill: f64,
    trained_skill_level: u8,
    active_skill_level: u8,
}
#[derive(Deserialize)]
struct SkillsResponse {
    skills: Vec<SkillEntry>,
    #[serde(default)]
    unallocated_sp: u64,
}
#[derive(Deserialize)]
struct AttributesResponse {
    intelligence: u8,
    perception: u8,
    charisma: u8,
    willpower: u8,
    memory: u8,
    #[serde(default)]
    bonus_remaps: u8,
    accrued_remap_cooldown_date: Option<String>,
}
#[derive(Deserialize)]
struct QueueEntry {
    skill_id: u32,
    start_date: Option<String>,
    finish_date: Option<String>,
    training_start_sp: Option<f64>,
    level_end_sp: Option<f64>,
}
fn build_snapshot(
    id: u64,
    name: String,
    skills: SkillsResponse,
    attrs: AttributesResponse,
    implants: Vec<CharacterImplant>,
    queue: Vec<QueueEntry>,
    now: DateTime<Utc>,
) -> Result<CharacterSnapshot, String> {
    let mut trained = BTreeMap::new();
    let mut warnings = vec![];
    if skills
        .skills
        .iter()
        .any(|s| s.active_skill_level < s.trained_skill_level)
    {
        warnings.push(
            "Расчёт для Omega: обнаружены ограничения активных уровней. Alpha не моделируется."
                .into(),
        );
    }
    for skill in skills.skills {
        if !skill.skillpoints_in_skill.is_finite() || skill.skillpoints_in_skill < 0.0 {
            return Err("Некорректные SP персонажа".into());
        }
        trained.insert(skill.skill_id, skill.skillpoints_in_skill);
    }
    for entry in queue {
        let Some(finish) = entry
            .finish_date
            .as_deref()
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        else {
            continue;
        };
        let Some(end) = entry.level_end_sp else {
            continue;
        };
        let points = if finish <= now {
            Some(end)
        } else if let (Some(start), Some(start_sp)) = (
            entry
                .start_date
                .as_deref()
                .and_then(|s| DateTime::parse_from_rfc3339(s).ok()),
            entry.training_start_sp,
        ) {
            if start < now && finish > start {
                Some(
                    start_sp
                        + (end - start_sp)
                            * ((now.signed_duration_since(start).num_milliseconds() as f64)
                                / (finish.signed_duration_since(start).num_milliseconds() as f64))
                                .clamp(0.0, 1.0),
                )
            } else {
                None
            }
        } else {
            None
        };
        if let Some(points) = points {
            trained
                .entry(entry.skill_id)
                .and_modify(|sp| *sp = sp.max(points))
                .or_insert(points);
        }
    }
    let bonuses = std::array::from_fn(|i| implants.iter().map(|v| v.bonuses[i]).sum::<u8>());
    if bonuses.iter().any(|b| *b > 5) {
        return Err("Не поддерживается бонус имплантов больше +5".into());
    }
    let total = [
        attrs.intelligence,
        attrs.perception,
        attrs.charisma,
        attrs.willpower,
        attrs.memory,
    ];
    let without: Vec<i16> = total
        .iter()
        .zip(bonuses)
        .map(|(a, b)| *a as i16 - b as i16)
        .collect();
    let extra = without.iter().sum::<i16>() - 99;
    if extra < 0 || extra % 5 != 0 {
        return Err("Не удалось отделить базовые атрибуты от временных бонусов ESI. Обновите персонажа после окончания бустера.".into());
    }
    let base: Vec<i16> = without.iter().map(|v| v - extra / 5).collect();
    if base.iter().any(|a| !(17..=27).contains(a)) {
        return Err(
            "Атрибуты персонажа вне допустимого remap. Обновите данные после окончания бустера."
                .into(),
        );
    }
    if extra > 0 {
        warnings.push("В ESI обнаружен временный бонус атрибутов. Он исключён из расчёта: срок действия бустера неизвестен.".into());
    }
    let next_remap = attrs.accrued_remap_cooldown_date;
    let annual = match &next_remap {
        Some(date) => {
            DateTime::parse_from_rfc3339(date).map_err(|_| "Некорректная дата remap ESI")? <= now
        }
        None => true,
    };
    let remap_count = attrs.bonus_remaps.saturating_add(u8::from(annual));
    if remap_count > 10 {
        return Err("Больше 10 доступных remap пока не поддерживается".into());
    }
    Ok(CharacterSnapshot {
        id,
        name,
        fetched_at: now.timestamp_millis() as u64,
        trained,
        attributes: std::array::from_fn(|i| base[i] as u8),
        implants,
        bonuses,
        remap_count,
        bonus_remaps: attrs.bonus_remaps,
        next_remap,
        unallocated_sp: skills.unallocated_sp,
        warnings,
    })
}

fn dotenv_client_id(text: &str) -> Option<String> {
    text.lines().find_map(|line| {
        let line = line
            .trim()
            .trim_start_matches('\u{feff}')
            .strip_prefix("export ")
            .unwrap_or(line.trim().trim_start_matches('\u{feff}'));
        let (key, value) = line.split_once('=')?;
        if key.trim() != "EVE_CLIENT_ID" {
            return None;
        }
        let value = value.trim();
        Some(
            if value.starts_with('"') && value.ends_with('"')
                || value.starts_with('\'') && value.ends_with('\'')
            {
                value[1..value.len() - 1].into()
            } else {
                value.split(" #").next().unwrap_or("").trim().into()
            },
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn skills() -> BTreeMap<u32, model::Skill> {
        crate::catalog::demo_items()
            .into_values()
            .filter_map(|i| i.skill.map(|s| (s.id, s)))
            .collect()
    }
    fn snapshot() -> CharacterSnapshot {
        CharacterSnapshot {
            id: 90000001,
            name: "Test pilot".into(),
            fetched_at: 100,
            trained: BTreeMap::from([(3402, 10000.0), (model::CYBERNETICS, model::sp(3.0, 5))]),
            attributes: [20, 20, 19, 20, 20],
            implants: vec![
                CharacterImplant {
                    id: 1,
                    name: "INT +1".into(),
                    slot: 4,
                    bonuses: [1, 0, 0, 0, 0],
                    booster_duration_bonus: 0.0,
                },
                CharacterImplant {
                    id: 2,
                    name: "PER +5".into(),
                    slot: 1,
                    bonuses: [0, 5, 0, 0, 0],
                    booster_duration_bonus: 0.0,
                },
            ],
            bonuses: [1, 5, 0, 0, 0],
            remap_count: 0,
            bonus_remaps: 0,
            next_remap: None,
            unallocated_sp: 0,
            warnings: vec![],
        }
    }
    #[test]
    fn adaptation_preserves_global_and_existing_implants_with_partial_sp() {
        let skills = skills();
        let plan = Plan {
            goals: vec![model::Requirement { id: 3402, level: 5 }],
            remap_count: 2,
            ..Plan::default()
        };
        let before = serde_json::to_string(&plan).unwrap();
        let global = optimizer::optimize(&plan, &skills).unwrap();
        let saved_global = serde_json::to_string(&global).unwrap();
        let adapted = adapt(&plan, &snapshot(), &skills, false, None).unwrap();
        assert_eq!(before, serde_json::to_string(&plan).unwrap());
        assert_eq!(saved_global, serde_json::to_string(&global).unwrap());
        assert_eq!(adapted.completed_levels, 3);
        assert_eq!(adapted.comparison.baseline.rows.len(), 2);
        assert_eq!(adapted.comparison.baseline.rows[0].level, 4);
        assert_eq!(
            adapted.comparison.baseline.rows[0].points,
            model::sp(1.0, 4) - 10000.0
        );
        let expected = (256000.0 - 10000.0) / 31.0 / 1440.0;
        assert!((adapted.comparison.baseline.days - expected).abs() < 1e-9);
        assert!(adapted.comparison.optimized.remaps.is_empty());
        assert!(adapted
            .comparison
            .optimized
            .installations
            .iter()
            .all(|i| i.purchases[0] == 0 && i.purchases[1] == 0));
        let replace = adapt(&plan, &snapshot(), &skills, true, None).unwrap();
        assert!(replace.comparison.optimized.days < adapted.comparison.optimized.days);
        assert!(replace
            .comparison
            .optimized
            .installations
            .iter()
            .any(|i| i.purchases[0] == 5));
    }
    #[test]
    fn personal_implant_replacement_is_independent_of_shared_purchase_setting() {
        let plan = Plan {
            goals: vec![model::Requirement { id: 3402, level: 5 }],
            optimize_implants: false,
            ..Plan::default()
        };
        let pilot = snapshot();
        let protected = adapt(&plan, &pilot, &skills(), false, None).unwrap();
        let replace = adapt(&plan, &pilot, &skills(), true, None).unwrap();
        assert!(replace.comparison.optimized.days < protected.comparison.optimized.days);
        assert!(replace.comparison.optimized.installations.iter().any(|i| i.purchases[0] == 5));
        assert!(!plan.optimize_implants);
    }
    #[test]
    fn personal_remap_override_is_validated_without_changing_source_or_snapshot() {
        let plan = Plan {
            goals: vec![model::Requirement { id: 3402, level: 5 }],
            remap_count: 2,
            ..Plan::default()
        };
        let mut pilot = snapshot();
        pilot.remap_count = 3;
        let adapted = adapt(&plan, &pilot, &skills(), false, Some(0)).unwrap();
        assert_eq!(adapted.remap_count, 0);
        assert!(adapted.comparison.optimized.remaps.is_empty());
        assert_eq!(
            adapt(&plan, &pilot, &skills(), false, None)
                .unwrap()
                .remap_count,
            3
        );
        assert!(adapt(&plan, &pilot, &skills(), false, Some(11)).is_err());
        assert_eq!(plan.remap_count, 2);
        assert_eq!(pilot.remap_count, 3);
    }
    #[test]
    fn fully_trained_character_needs_no_training_remaps_or_purchases() {
        let plan = Plan {
            goals: vec![model::Requirement { id: 3402, level: 5 }],
            ..Plan::default()
        };
        let mut pilot = snapshot();
        pilot.trained.insert(3402, 256000.0);
        let result = adapt(&plan, &pilot, &skills(), true, None)
            .unwrap()
            .comparison
            .optimized;
        assert_eq!(result.days, 0.0);
        assert!(result.rows.is_empty());
        assert!(result.installations.is_empty());
        assert!(result.remaps.is_empty());
    }
    #[test]
    fn esi_snapshot_subtracts_implants_and_updates_finished_and_active_training() {
        let now = DateTime::parse_from_rfc3339("2026-11-05T12:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let skills = SkillsResponse {
            skills: vec![SkillEntry {
                skill_id: 3300,
                skillpoints_in_skill: 1000.0,
                trained_skill_level: 1,
                active_skill_level: 1,
            }],
            unallocated_sp: 123,
        };
        let attributes = AttributesResponse {
            intelligence: 23,
            perception: 20,
            charisma: 19,
            willpower: 20,
            memory: 20,
            bonus_remaps: 2,
            accrued_remap_cooldown_date: Some("2027-01-01T00:00:00Z".into()),
        };
        let implants = vec![CharacterImplant {
            id: 1,
            name: "INT +3".into(),
            slot: 4,
            bonuses: [3, 0, 0, 0, 0],
            booster_duration_bonus: 0.0,
        }];
        let q = |id, start: &str, end: &str, start_sp, end_sp| QueueEntry {
            skill_id: id,
            start_date: Some(start.into()),
            finish_date: Some(end.into()),
            training_start_sp: Some(start_sp),
            level_end_sp: Some(end_sp),
        };
        let queue = vec![
            q(
                3300,
                "2026-11-05T11:55:00Z",
                "2026-11-05T12:05:00Z",
                1000.0,
                8000.0,
            ),
            q(
                3402,
                "2026-11-05T11:00:00Z",
                "2026-11-05T11:30:00Z",
                0.0,
                250.0,
            ),
            q(
                3330,
                "2026-11-05T12:05:00Z",
                "2026-11-05T13:00:00Z",
                0.0,
                1000.0,
            ),
        ];
        let pilot =
            build_snapshot(1, "Pilot".into(), skills, attributes, implants, queue, now).unwrap();
        assert_eq!(pilot.attributes, [20, 20, 19, 20, 20]);
        assert_eq!(pilot.bonuses, [3, 0, 0, 0, 0]);
        assert_eq!(pilot.trained[&3300], 4500.0);
        assert_eq!(pilot.trained[&3402], 250.0);
        assert!(!pilot.trained.contains_key(&3330));
        assert_eq!(pilot.remap_count, 2);
        assert_eq!(pilot.unallocated_sp, 123);
    }
    #[test]
    fn callback_rejects_wrong_state_host_path_and_duplicate_parameters() {
        let request =
            "GET /sso/callback?state=valid&code=abc HTTP/1.1\r\nHost: 127.0.0.1:17422\r\n\r\n";
        assert_eq!(parse_callback(request, "valid").unwrap()["code"], "abc");
        assert!(parse_callback(request, "wrong").is_err());
        assert!(parse_callback(
            &request.replace("Host: 127.0.0.1:17422", "Host: evil.example"),
            "valid"
        )
        .is_err());
        assert!(parse_callback(
            &request.replace("&code=abc", "&state=valid&code=abc"),
            "valid"
        )
        .is_err());
        assert!(parse_callback(&request.replace("/sso/callback?", "/other?"), "valid").is_err());
    }
    #[test]
    fn dotenv_reads_only_public_client_id() {
        assert_eq!(
            dotenv_client_id("EVE_CLIENT_SECRET=secret\nEVE_CLIENT_ID=\"public-id\""),
            Some("public-id".into())
        );
        assert_eq!(dotenv_client_id("EVE_CLIENT_SECRET=secret"), None);
    }
    #[cfg(windows)]
    #[test]
    fn refresh_token_encryption_roundtrip() {
        let input = b"test-refresh-token";
        let encrypted = crate::secrets::protect(input, false).unwrap();
        assert_ne!(encrypted, input);
        assert_eq!(crate::secrets::protect(&encrypted, true).unwrap(), input);
    }
}
