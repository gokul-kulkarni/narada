use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use super::files::{read_optional, write_atomic};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Folder holding Collections/ and Environments/ (e.g. a Google Drive for Desktop folder).
    pub storage_dir: Option<PathBuf>,
    /// Google OAuth "Desktop app" client, needed only for Drive API sync.
    pub google_client_id: Option<String>,
    pub google_client_secret: Option<String>,
}

pub fn load(path: &Path) -> Result<Settings, String> {
    match read_optional(path)? {
        Some(content) => serde_json::from_str(&content).map_err(|e| format!("Invalid settings file: {e}")),
        None => Ok(Settings::default()),
    }
}

pub fn save(path: &Path, settings: &Settings) -> Result<(), String> {
    let content = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    write_atomic(path, &content)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_and_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        assert_eq!(load(&path).unwrap(), Settings::default());
        let settings = Settings { storage_dir: Some("/x".into()), ..Settings::default() };
        save(&path, &settings).unwrap();
        assert_eq!(load(&path).unwrap(), settings);
    }

    #[test]
    fn rejects_corrupt_settings() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        std::fs::write(&path, "not json").unwrap();
        assert!(load(&path).unwrap_err().contains("Invalid settings"));
    }
}
