pub mod files;
pub mod migrate;
pub mod paths;
pub mod settings;

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

pub use files::StoredDocument;
pub use settings::Settings;

pub struct StorageState {
    pub data_dir: PathBuf,
    settings_path: PathBuf,
    settings: Mutex<Settings>,
}

impl StorageState {
    pub fn init(app: &AppHandle) -> Result<Self, String> {
        let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
        migrate::adopt_legacy_dir(&data_dir)?;
        migrate::adopt_legacy_dir(&config_dir)?;
        let settings_path = config_dir.join("settings.json");
        let settings = settings::load(&settings_path)?;
        let state = Self { data_dir, settings_path, settings: Mutex::new(settings) };
        files::ensure_layout(&state.root())?;
        Ok(state)
    }

    pub fn settings(&self) -> Settings {
        self.settings.lock().expect("settings lock poisoned").clone()
    }

    pub fn update_settings(&self, update: impl FnOnce(Settings) -> Settings) -> Result<Settings, String> {
        let mut guard = self.settings.lock().map_err(|_| "settings lock poisoned")?;
        let next = update(guard.clone());
        settings::save(&self.settings_path, &next)?;
        *guard = next.clone();
        Ok(next)
    }

    /// Storage root: the user's chosen folder, or `<app data>/workspace`.
    pub fn root(&self) -> PathBuf {
        self.settings().storage_dir.unwrap_or_else(|| self.data_dir.join("workspace"))
    }
}

#[tauri::command]
pub fn get_storage_dir(state: State<'_, StorageState>) -> String {
    state.root().display().to_string()
}

#[tauri::command]
pub fn set_storage_dir(state: State<'_, StorageState>, path: Option<String>) -> Result<String, String> {
    let dir = path.map(PathBuf::from);
    if let Some(dir) = &dir {
        if !dir.is_dir() {
            return Err(format!("Not a folder: {}", dir.display()));
        }
        files::ensure_layout(dir)?;
    }
    state.update_settings(|s| Settings { storage_dir: dir, ..s })?;
    files::ensure_layout(&state.root())?;
    Ok(state.root().display().to_string())
}

#[tauri::command]
pub fn list_documents(state: State<'_, StorageState>, kind: String) -> Result<Vec<StoredDocument>, String> {
    files::list_documents(&state.root(), &kind)
}

#[tauri::command]
pub fn write_document(
    state: State<'_, StorageState>,
    kind: String,
    file_name: String,
    content: String,
) -> Result<(), String> {
    files::write_atomic(&paths::document_path(&state.root(), &kind, &file_name)?, &content)
}

#[tauri::command]
pub fn delete_document(state: State<'_, StorageState>, kind: String, file_name: String) -> Result<(), String> {
    files::remove_file(&paths::document_path(&state.root(), &kind, &file_name)?)
}

#[tauri::command]
pub fn read_local(state: State<'_, StorageState>, name: String) -> Result<Option<String>, String> {
    files::read_optional(&paths::local_path(&state.data_dir, &name)?)
}

#[tauri::command]
pub fn write_local(state: State<'_, StorageState>, name: String, content: String) -> Result<(), String> {
    files::write_atomic(&paths::local_path(&state.data_dir, &name)?, &content)
}

/// Writes an export to a path the user picked in the native save dialog.
#[tauri::command]
pub fn export_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("Could not write {path}: {e}"))
}
