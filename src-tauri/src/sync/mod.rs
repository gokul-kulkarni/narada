pub mod drive;
pub mod engine;
pub mod oauth;
pub mod plan;

use serde::Serialize;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::Mutex;

use crate::secrets;
use crate::storage::{paths::local_path, Settings, StorageState};

const REFRESH_TOKEN_KEY: &str = "google:refresh-token";
/// Refresh a little early so a token never expires mid-sync.
const EXPIRY_MARGIN: Duration = Duration::from_secs(60);

pub struct DriveState {
    http: reqwest::Client,
    access: Mutex<Option<(String, Instant)>>,
    /// Held for the whole sync so two syncs can never interleave.
    sync_lock: Mutex<()>,
}

impl DriveState {
    pub fn new() -> Self {
        Self { http: reqwest::Client::new(), access: Mutex::new(None), sync_lock: Mutex::new(()) }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveStatus {
    configured: bool,
    signed_in: bool,
    client_id: Option<String>,
}

fn client_config(settings: &Settings) -> Result<oauth::ClientConfig, String> {
    match (&settings.google_client_id, &settings.google_client_secret) {
        (Some(id), Some(secret)) if !id.is_empty() => Ok(oauth::ClientConfig { client_id: id.clone(), client_secret: secret.clone() }),
        _ => Err("Add your Google OAuth client ID and secret in Settings first".into()),
    }
}

fn cache_token(token: &oauth::TokenResponse) -> (String, Instant) {
    let lifetime = Duration::from_secs(token.expires_in.unwrap_or(3600));
    (token.access_token.clone(), Instant::now() + lifetime.saturating_sub(EXPIRY_MARGIN))
}

async fn access_token(drive: &DriveState, settings: &Settings) -> Result<String, String> {
    let mut access = drive.access.lock().await;
    if let Some((token, expires)) = access.as_ref() {
        if Instant::now() < *expires {
            return Ok(token.clone());
        }
    }
    let refresh_token = secrets::get(REFRESH_TOKEN_KEY)?.ok_or("Not signed in to Google Drive")?;
    let token = oauth::refresh(&drive.http, &client_config(settings)?, &refresh_token).await?;
    let cached = cache_token(&token);
    *access = Some(cached.clone());
    Ok(cached.0)
}

#[tauri::command]
pub fn drive_status(storage: State<'_, StorageState>) -> Result<DriveStatus, String> {
    let settings = storage.settings();
    Ok(DriveStatus {
        configured: client_config(&settings).is_ok(),
        signed_in: secrets::get(REFRESH_TOKEN_KEY)?.is_some(),
        client_id: settings.google_client_id,
    })
}

#[tauri::command]
pub fn drive_configure(storage: State<'_, StorageState>, client_id: String, client_secret: String) -> Result<(), String> {
    let (id, secret) = (client_id.trim().to_string(), client_secret.trim().to_string());
    if !id.ends_with(".apps.googleusercontent.com") {
        return Err("That doesn't look like a Google OAuth client ID (…apps.googleusercontent.com)".into());
    }
    storage
        .update_settings(|s| Settings { google_client_id: Some(id), google_client_secret: Some(secret), ..s })
        .map(|_| ())
}

#[tauri::command]
pub async fn drive_sign_in(app: AppHandle, storage: State<'_, StorageState>, drive: State<'_, DriveState>) -> Result<(), String> {
    let config = client_config(&storage.settings())?;
    let token = oauth::sign_in(&drive.http, &config, |url| {
        app.opener().open_url(url, None::<&str>).map_err(|e| format!("Could not open the browser: {e}"))
    })
    .await?;
    let refresh_token = token.refresh_token.as_deref().ok_or("Google did not return a refresh token; try signing in again")?;
    secrets::set(REFRESH_TOKEN_KEY, refresh_token)?;
    *drive.access.lock().await = Some(cache_token(&token));
    Ok(())
}

#[tauri::command]
pub async fn drive_sign_out(storage: State<'_, StorageState>, drive: State<'_, DriveState>) -> Result<(), String> {
    secrets::delete(REFRESH_TOKEN_KEY)?;
    *drive.access.lock().await = None;
    // Forget what was synced so a later sign-in (maybe another account) starts fresh and never deletes.
    crate::storage::files::remove_file(&local_path(&storage.data_dir, "sync-state.json")?)
}

#[tauri::command]
pub async fn drive_sync(storage: State<'_, StorageState>, drive: State<'_, DriveState>) -> Result<engine::SyncReport, String> {
    let _guard = drive.sync_lock.try_lock().map_err(|_| "A sync is already running")?;
    let settings = storage.settings();
    let token = access_token(&drive, &settings).await?;
    let client = drive::DriveClient { http: &drive.http, token };
    let state_path = local_path(&storage.data_dir, "sync-state.json")?;
    let mut state = engine::load_state(&state_path)?;
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0).to_string();
    let result = engine::sync(&client, &storage.root(), &storage.data_dir.join("conflicts"), &mut state, &stamp).await;
    // Save progress even after a partial failure so finished steps aren't repeated or misread.
    engine::save_state(&state_path, &state)?;
    result
}
