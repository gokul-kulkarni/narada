use serde::Serialize;
use std::fs;
use std::path::Path;

use super::paths::{kind_dir, validate_file_name, COLLECTIONS_DIR, ENVIRONMENTS_DIR};

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredDocument {
    pub file_name: String,
    pub content: String,
}

pub fn ensure_layout(root: &Path) -> Result<(), String> {
    for dir in [COLLECTIONS_DIR, ENVIRONMENTS_DIR] {
        fs::create_dir_all(root.join(dir))
            .map_err(|e| format!("Could not create {}: {e}", root.join(dir).display()))?;
    }
    Ok(())
}

/// Lists valid `.json` documents of a kind, sorted by name; unreadable files are skipped.
pub fn list_documents(root: &Path, kind: &str) -> Result<Vec<StoredDocument>, String> {
    let dir = root.join(kind_dir(kind)?);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let entries = fs::read_dir(&dir).map_err(|e| format!("Could not read {}: {e}", dir.display()))?;
    let mut documents: Vec<StoredDocument> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let file_name = entry.file_name().into_string().ok()?;
            validate_file_name(&file_name).ok()?;
            let content = fs::read_to_string(entry.path()).ok()?;
            Some(StoredDocument { file_name, content })
        })
        .collect();
    documents.sort_by(|a, b| a.file_name.cmp(&b.file_name));
    Ok(documents)
}

/// Writes via a temp file + rename so a crash never leaves a half-written document.
pub fn write_atomic(path: &Path, content: &str) -> Result<(), String> {
    let parent = path.parent().ok_or("File has no parent directory")?;
    fs::create_dir_all(parent).map_err(|e| format!("Could not create {}: {e}", parent.display()))?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, content).map_err(|e| format!("Could not write {}: {e}", temp.display()))?;
    fs::rename(&temp, path).map_err(|e| format!("Could not save {}: {e}", path.display()))
}

pub fn remove_file(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("Could not delete {}: {e}", path.display())),
    }
}

pub fn read_optional(path: &Path) -> Result<Option<String>, String> {
    match fs::read_to_string(path) {
        Ok(content) => Ok(Some(content)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Could not read {}: {e}", path.display())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::paths::document_path;

    #[test]
    fn writes_lists_and_removes_documents() {
        let root = tempfile::tempdir().unwrap();
        ensure_layout(root.path()).unwrap();
        let b = document_path(root.path(), "collections", "b.json").unwrap();
        let a = document_path(root.path(), "collections", "a.json").unwrap();
        write_atomic(&b, "{\"b\":1}").unwrap();
        write_atomic(&a, "{\"a\":1}").unwrap();
        fs::write(root.path().join("Collections/notes.txt"), "ignored").unwrap();

        let names: Vec<_> = list_documents(root.path(), "collections")
            .unwrap()
            .into_iter()
            .map(|d| d.file_name)
            .collect();
        assert_eq!(names, ["a.json", "b.json"]);

        remove_file(&a).unwrap();
        remove_file(&a).unwrap(); // idempotent
        assert_eq!(list_documents(root.path(), "collections").unwrap().len(), 1);
        assert!(!root.path().join("Collections/b.json.tmp").exists());
    }

    #[test]
    fn missing_folders_and_files_are_empty() {
        let root = tempfile::tempdir().unwrap();
        assert!(list_documents(root.path(), "environments").unwrap().is_empty());
        assert_eq!(read_optional(&root.path().join("nope.json")).unwrap(), None);
    }
}
