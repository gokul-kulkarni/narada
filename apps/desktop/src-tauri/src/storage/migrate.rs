//! One-time move of data written under the app's previous identifier.

use std::fs;
use std::path::Path;

/// Identifier the app used before it was renamed to Narada.
pub const LEGACY_IDENTIFIER: &str = "com.freepostman.app";

/// Moves `<parent>/<LEGACY_IDENTIFIER>` to `dir` when `dir` doesn't exist yet.
/// Returns whether anything was moved; an existing `dir` is never touched.
pub fn adopt_legacy_dir(dir: &Path) -> Result<bool, String> {
    let Some(legacy) = dir.parent().map(|p| p.join(LEGACY_IDENTIFIER)) else {
        return Ok(false);
    };
    if dir.exists() || !legacy.is_dir() {
        return Ok(false);
    }
    fs::rename(&legacy, dir).map(|()| true).map_err(|e| {
        format!(
            "Could not move {} to {}: {e}",
            legacy.display(),
            dir.display()
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn moves_the_legacy_folder_when_the_new_one_is_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let legacy = tmp.path().join(LEGACY_IDENTIFIER);
        fs::create_dir_all(legacy.join("workspace")).unwrap();
        fs::write(legacy.join("history.json"), "[]").unwrap();
        let dir = tmp.path().join("com.narada.app");

        assert!(adopt_legacy_dir(&dir).unwrap());
        assert_eq!(fs::read_to_string(dir.join("history.json")).unwrap(), "[]");
        assert!(dir.join("workspace").is_dir());
        assert!(!legacy.exists());
        assert!(!adopt_legacy_dir(&dir).unwrap()); // second run is a no-op
    }

    #[test]
    fn leaves_an_existing_folder_alone() {
        let tmp = tempfile::tempdir().unwrap();
        fs::create_dir_all(tmp.path().join(LEGACY_IDENTIFIER)).unwrap();
        let dir = tmp.path().join("com.narada.app");
        fs::create_dir_all(&dir).unwrap();

        assert!(!adopt_legacy_dir(&dir).unwrap());
        assert!(tmp.path().join(LEGACY_IDENTIFIER).exists());
    }

    #[test]
    fn does_nothing_without_legacy_data() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(!adopt_legacy_dir(&tmp.path().join("com.narada.app")).unwrap());
    }
}
