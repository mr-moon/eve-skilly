#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::Value;
use skilly::app::AppService;
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use tauri::{Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

struct Ready(AtomicBool);

#[tauri::command]
async fn pick_pyfa_database(app: tauri::AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .add_filter("Pyfa database", &["db"])
            .blocking_pick_file()
            .map(|file| {
                file.into_path()
                    .map(|p| p.to_string_lossy().into_owned())
                    .map_err(|e| e.to_string())
            })
            .transpose()
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn request(
    service: tauri::State<'_, Arc<AppService>>,
    path: String,
    body: Value,
) -> Result<Value, String> {
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.dispatch(&path, body))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn import_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = app
            .dialog()
            .file()
            .add_filter("Skilly plan", &["json"])
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let path = file.into_path().map_err(|e| e.to_string())?;
        if std::fs::metadata(&path).map_err(|e| e.to_string())?.len() > 2 * 1024 * 1024 {
            return Err("План больше 2 МБ".into());
        }
        std::fs::read_to_string(path)
            .map(Some)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn export_file(app: tauri::AppHandle, name: String, text: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let name = std::path::Path::new(&name)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("skilly-plan.json");
        let Some(file) = app.dialog().file().set_file_name(name).blocking_save_file() else {
            return Ok(false);
        };
        let path = file.into_path().map_err(|e| e.to_string())?;
        std::fs::write(path, text).map_err(|e| e.to_string())?;
        Ok(true)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn copy_text(app: tauri::AppHandle, text: String) -> Result<(), String> {
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

#[tauri::command]
async fn confirm_action(app: tauri::AppHandle, message: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .message(message)
            .title("Skilly")
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancel)
            .blocking_show()
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn frontend_ready(ready: tauri::State<'_, Ready>) {
    ready.0.store(true, Ordering::Release);
}

#[tauri::command]
fn finish_close(window: tauri::WebviewWindow) -> Result<(), String> {
    window.destroy().map_err(|e| e.to_string())
}

fn main() {
    let diagnostic = std::env::args().any(|arg| arg == "--storage-report");
    let mut builder = tauri::Builder::default();
    if !diagnostic {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }
    let result = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Ready(AtomicBool::new(false)))
        .setup(move |app| {
            let args: Vec<_> = std::env::args().collect();
            let custom = args
                .iter()
                .position(|a| a == "--data-dir")
                .and_then(|i| args.get(i + 1))
                .map(PathBuf::from);
            let data = custom.clone().unwrap_or(app.path().home_dir()?.join(".skilly").join("data"));
            if custom.is_none() && !diagnostic {
                let mut sources = vec![app.path().app_local_data_dir()?.join("data")];
                if let Some(local) = std::env::var_os("LOCALAPPDATA") {
                    let local = PathBuf::from(local);
                    sources.push(local.join("app.skilly.planner").join("data"));
                    if let Ok(packages) = std::fs::read_dir(local.join("Packages")) {
                        for package in packages.flatten() {
                            let name = package.file_name().to_string_lossy().into_owned();
                            if name.starts_with("OpenAI.Codex_") || name.starts_with("OpenAI.ChatGPT-Desktop_") {
                                sources.push(package.path().join("LocalCache/Local/app.skilly.planner/data"));
                            }
                        }
                    }
                }
                sources.sort(); sources.dedup();
                // Seed the current draft from the most recently used profile.
                sources.sort_by_key(|path| std::cmp::Reverse(std::fs::metadata(path.join("draft.json")).and_then(|m| m.modified()).ok()));
                for source in sources {
                    skilly::storage::migrate_desktop_profile(&source, &data).map_err(std::io::Error::other)?;
                }
            }
            if let Some(report_path) = args.iter().position(|a| a == "--storage-report").and_then(|i| args.get(i + 1)) {
                let read = |name: &str| std::fs::read(data.join(name)).ok().and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok());
                let report = serde_json::json!({
                    "data_dir": data,
                    "identifier": app.config().identifier,
                    "character_count": read("characters.json").and_then(|value| value.as_object().map(|map| map.len())).unwrap_or(0),
                    "draft_plan": read("draft.json").and_then(|value| value.pointer("/workspace/plan/name").cloned()),
                });
                std::fs::write(report_path, serde_json::to_vec_pretty(&report)?)?;
                app.handle().exit(0);
                return Ok(());
            }
            let legacy = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap()
                .join("data");
            if legacy.is_dir() && legacy != data {
                skilly::storage::migrate_legacy(&legacy, &data).map_err(std::io::Error::other)?;
            }
            app.manage(Arc::new(
                AppService::new(data).map_err(std::io::Error::other)?,
            ));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            request,
            pick_pyfa_database,
            import_file,
            export_file,
            copy_text,
            confirm_action,
            frontend_ready,
            finish_close
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.state::<Ready>().0.load(Ordering::Acquire) {
                    api.prevent_close();
                    let _ = window.emit("skilly-close-requested", ());
                }
            }
        })
        .run(tauri::generate_context!());
    if let Err(error) = result {
        eprintln!("Skilly: {error}");
    }
}
