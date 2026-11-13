use crate::app::AppService;
pub use crate::storage::write_json;
use serde_json::{json, Value};
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::PathBuf,
    sync::Arc,
    time::Duration,
};

pub fn run(data: PathBuf, open: bool) -> Result<(), String> {
    let state = Arc::new(AppService::new(data.clone())?);
    let listener = TcpListener::bind("127.0.0.1:17421")
        .or_else(|_| TcpListener::bind("127.0.0.1:0"))
        .map_err(|e| e.to_string())?;
    let address = listener
        .local_addr()
        .map_err(|e| e.to_string())?
        .to_string();
    let url = format!("http://{address}");
    println!(
        "Skilly — {url}\nДанные: {}\nCtrl+C для выхода",
        data.display()
    );
    if open {
        open_browser(&url);
    }
    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                let state = state.clone();
                let host = address.clone();
                std::thread::spawn(move || {
                    if let Err(e) = handle(stream, &host, state) {
                        eprintln!("HTTP: {e}");
                    }
                });
            }
            Err(e) => eprintln!("HTTP accept: {e}"),
        }
    }
    Ok(())
}

pub(crate) fn open_browser(url: &str) {
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", url])
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(url).spawn();
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let _ = std::process::Command::new("xdg-open").arg(url).spawn();
    }
}

fn handle(mut stream: TcpStream, host: &str, state: Arc<AppService>) -> Result<(), String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(10)))
        .map_err(|e| e.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(10)))
        .map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    let mut buf = [0u8; 8192];
    let end = loop {
        let n = stream.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            return Ok(());
        }
        bytes.extend_from_slice(&buf[..n]);
        if let Some(i) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
            break i + 4;
        }
        if bytes.len() > 16384 {
            return response(
                &mut stream,
                400,
                "text/plain",
                "Headers too large".as_bytes(),
            );
        }
    };
    let header = String::from_utf8(bytes[..end].to_vec()).map_err(|e| e.to_string())?;
    let mut lines = header.split("\r\n");
    let request = lines.next().unwrap_or("");
    let mut parts = request.split_whitespace();
    let method = parts.next().unwrap_or("");
    let path = parts.next().unwrap_or("");
    let headers: Vec<_> = lines
        .filter_map(|l| l.split_once(':'))
        .map(|(k, v)| (k.to_ascii_lowercase(), v.trim()))
        .collect();
    let get = |name: &str| headers.iter().find(|(k, _)| k == name).map(|(_, v)| *v);
    if get("host") != Some(host) || get("origin").is_some_and(|o| o != format!("http://{host}")) {
        return response(&mut stream, 403, "text/plain", b"Origin rejected");
    }
    if method == "GET" {
        let (mime, body) = match path {
            "/app-icon.png" => return response(&mut stream,200,"image/png",include_bytes!("../ui/app-icon.png")),
            "/" => ("text/html; charset=utf-8", include_str!("../ui/index.html")),
            "/journey.js" => (
                "text/javascript; charset=utf-8",
                include_str!("../ui/journey.js"),
            ),
            "/auto-optimizer.js" => (
                "text/javascript; charset=utf-8",
                include_str!("../ui/auto-optimizer.js"),
            ),
            "/queue-controls.js" => (
                "text/javascript; charset=utf-8",
                include_str!("../ui/queue-controls.js"),
            ),
            "/tracking.js" => (
                "text/javascript; charset=utf-8",
                include_str!("../ui/tracking.js"),
            ),
            "/goal-controls.js" => (
                "text/javascript; charset=utf-8",
                include_str!("../ui/goal-controls.js"),
            ),
            "/app.js" => (
                "text/javascript; charset=utf-8",
                include_str!("../ui/app.js"),
            ),
            "/fits.js" => (
                "text/javascript; charset=utf-8",
                include_str!("../ui/fits.js"),
            ),
            "/plans.js" => (
                "text/javascript; charset=utf-8",
                include_str!("../ui/plans.js"),
            ),
            "/characters.js" => (
                "text/javascript; charset=utf-8",
                include_str!("../ui/characters.js"),
            ),
            "/groups.js" => (
                "text/javascript; charset=utf-8",
                include_str!("../ui/groups.js"),
            ),
            "/acceleration.js" => (
                "text/javascript; charset=utf-8",
                include_str!("../ui/acceleration.js"),
            ),
            "/books.js" => (
                "text/javascript; charset=utf-8",
                include_str!("../ui/books.js"),
            ),
            "/plan-screen.css" => (
                "text/css; charset=utf-8",
                include_str!("../ui/plan-screen.css"),
            ),
            "/style.css" => ("text/css; charset=utf-8", include_str!("../ui/style.css")),
            "/api/state" | "/api/plans" | "/api/characters" | "/api/fits" => {
                return json_response(&mut stream, state.dispatch(path, Value::Null));
            }
            _ => return response(&mut stream, 404, "text/plain", b"Not found"),
        };
        return response(&mut stream, 200, mime, body.as_bytes());
    }
    if method != "POST"
        || get("content-type").map(|v| v.split(';').next().unwrap_or("").trim())
            != Some("application/json")
        || get("transfer-encoding").is_some()
    {
        return response(&mut stream, 400, "text/plain", b"Expected JSON POST");
    }
    let length = get("content-length")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(usize::MAX);
    if length > 2 * 1024 * 1024 {
        return response(&mut stream, 413, "text/plain", b"Request too large");
    }
    while bytes.len() < end + length {
        let n = stream.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            return Err("Incomplete body".into());
        }
        bytes.extend_from_slice(&buf[..n]);
    }
    let result = serde_json::from_slice::<Value>(&bytes[end..end + length])
        .map_err(|e| e.to_string())
        .and_then(|body| state.dispatch(path, body));
    json_response(&mut stream, result)
}

fn json_response(stream: &mut TcpStream, result: Result<Value, String>) -> Result<(), String> {
    let (status, value) = match result {
        Ok(value) => (200, value),
        Err(error) => (400, json!({"error":error})),
    };
    response(
        stream,
        status,
        "application/json; charset=utf-8",
        serde_json::to_string(&value)
            .map_err(|e| e.to_string())?
            .as_bytes(),
    )
}

fn response(stream: &mut TcpStream, status: u16, mime: &str, body: &[u8]) -> Result<(), String> {
    let reason = match status {
        200 => "OK",
        403 => "Forbidden",
        404 => "Not Found",
        413 => "Payload Too Large",
        _ => "Bad Request",
    };
    write!(stream,"HTTP/1.1 {status} {reason}\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nContent-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data: https://images.evetech.net; frame-ancestors 'none'\r\n\r\n",body.len()).and_then(|_|stream.write_all(body)).map_err(|e|e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Plan;
    #[test]
    fn persisted_plan_roundtrip_and_replace() {
        let dir = std::env::temp_dir().join(format!("skilly-test-{}", std::process::id()));
        let path = dir.join("plan.json");
        let mut p = Plan::default();
        write_json(&path, &p).unwrap();
        p.name = "Saved pilot".into();
        write_json(&path, &p).unwrap();
        let loaded: Plan = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(loaded.name, p.name);
        std::fs::remove_file(path).unwrap();
        std::fs::remove_dir(dir).unwrap();
    }
}
