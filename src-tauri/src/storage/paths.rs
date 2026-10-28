use std::path::{Path, PathBuf};

pub const COLLECTIONS_DIR: &str = "Collections";
pub const ENVIRONMENTS_DIR: &str = "Environments";
pub const MCP_DIR: &str = "MCP";

/// Local-only files (never synced) the frontend may read and write.
pub const LOCAL_FILES: &[&str] = &[
    "history.json",
    "globals.json",
    "sync-state.json",
    "mcp-trust.json",
];

pub fn kind_dir(kind: &str) -> Result<&'static str, String> {
    match kind {
        "collections" => Ok(COLLECTIONS_DIR),
        "environments" => Ok(ENVIRONMENTS_DIR),
        "mcp" => Ok(MCP_DIR),
        other => Err(format!("Unknown document kind: {other}")),
    }
}

/// Accepts plain `.json` file names only, so callers can never escape the storage folder.
pub fn validate_file_name(name: &str) -> Result<&str, String> {
    let valid_chars = name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    let valid = !name.is_empty()
        && name.len() <= 200
        && valid_chars
        && !name.starts_with('.')
        && !name.contains("..")
        && name.ends_with(".json");
    if valid {
        Ok(name)
    } else {
        Err(format!("Invalid file name: {name}"))
    }
}

pub fn document_path(root: &Path, kind: &str, file_name: &str) -> Result<PathBuf, String> {
    Ok(root
        .join(kind_dir(kind)?)
        .join(validate_file_name(file_name)?))
}

pub fn local_path(data_dir: &Path, name: &str) -> Result<PathBuf, String> {
    if LOCAL_FILES.contains(&name) {
        Ok(data_dir.join(name))
    } else {
        Err(format!("Not a local file: {name}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_simple_json_names() {
        assert!(validate_file_name("abc-123.postman_collection.json").is_ok());
    }

    #[test]
    fn rejects_traversal_and_odd_names() {
        for bad in [
            "../x.json",
            "a/b.json",
            "x.txt",
            "",
            ".hidden.json",
            "a..b.json",
            "a b.json",
        ] {
            assert!(validate_file_name(bad).is_err(), "{bad} should be rejected");
        }
    }

    #[test]
    fn maps_kinds_and_local_files() {
        let root = Path::new("/root");
        assert_eq!(
            document_path(root, "environments", "e.json").unwrap(),
            PathBuf::from("/root/Environments/e.json")
        );
        assert!(document_path(root, "secrets", "e.json").is_err());
        assert!(local_path(root, "history.json").is_ok());
        assert!(local_path(root, "settings.json").is_err());
    }
}
