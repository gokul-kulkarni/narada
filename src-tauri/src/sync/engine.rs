//! Executes a sync plan between the storage folder and Drive, recording what was synced.

use md5::{Digest, Md5};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;

use super::drive::Remote;
use super::plan::{plan, Action, RemoteFile, SyncedFile};
use crate::storage::files::{list_documents, read_optional, remove_file, write_atomic};
use crate::storage::paths::{document_path, kind_dir};

pub const DRIVE_FOLDER: &str = "narada";
pub const KINDS: [&str; 2] = ["collections", "environments"];

#[derive(Debug, Default, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct SyncState {
    pub folder_ids: BTreeMap<String, String>,
    /// Keyed by "<kind>/<file name>".
    pub files: BTreeMap<String, StateEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StateEntry {
    pub remote_id: String,
    pub md5: String,
}

#[derive(Debug, Default, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    pub uploaded: Vec<String>,
    pub downloaded: Vec<String>,
    pub deleted_local: Vec<String>,
    pub deleted_remote: Vec<String>,
    /// Files changed on both sides; the local copy was saved under `conflicts/`.
    pub conflicts: Vec<String>,
}

pub fn md5_hex(content: &[u8]) -> String {
    Md5::digest(content).iter().map(|b| format!("{b:02x}")).collect()
}

pub fn load_state(path: &Path) -> Result<SyncState, String> {
    match read_optional(path)? {
        Some(text) => serde_json::from_str(&text).map_err(|e| format!("Invalid sync state: {e}")),
        None => Ok(SyncState::default()),
    }
}

pub fn save_state(path: &Path, state: &SyncState) -> Result<(), String> {
    write_atomic(path, &serde_json::to_string_pretty(state).map_err(|e| e.to_string())?)
}

async fn folder_ids<R: Remote>(remote: &R, state: &mut SyncState) -> Result<BTreeMap<&'static str, String>, String> {
    let root = remote.find_or_create_folder(DRIVE_FOLDER, None).await?;
    let mut ids = BTreeMap::new();
    for kind in KINDS {
        ids.insert(kind, remote.find_or_create_folder(kind_dir(kind)?, Some(&root)).await?);
    }
    state.folder_ids = ids.iter().map(|(k, v)| (k.to_string(), v.clone())).collect();
    state.folder_ids.insert("root".into(), root);
    Ok(ids)
}

/// Two-way sync of Collections/ and Environments/ under `root` with Drive's narada folder.
pub async fn sync<R: Remote>(remote: &R, root: &Path, conflicts_dir: &Path, state: &mut SyncState, stamp: &str) -> Result<SyncReport, String> {
    let folders = folder_ids(remote, state).await?;
    let mut report = SyncReport::default();
    for kind in KINDS {
        sync_kind(remote, root, conflicts_dir, &folders[kind], kind, state, &mut report, stamp).await?;
    }
    Ok(report)
}

#[allow(clippy::too_many_arguments)]
async fn sync_kind<R: Remote>(
    remote: &R,
    root: &Path,
    conflicts_dir: &Path,
    folder_id: &str,
    kind: &str,
    state: &mut SyncState,
    report: &mut SyncReport,
    stamp: &str,
) -> Result<(), String> {
    let docs = list_documents(root, kind)?;
    let contents: BTreeMap<String, String> = docs.into_iter().map(|d| (d.file_name, d.content)).collect();
    let local: BTreeMap<String, String> = contents.iter().map(|(n, c)| (n.clone(), md5_hex(c.as_bytes()))).collect();

    // Drive allows duplicate names; listing is newest first, so keep the first of each.
    let mut remote_files = BTreeMap::new();
    for file in remote.list(folder_id).await? {
        if crate::storage::paths::validate_file_name(&file.name).is_ok() && !remote_files.contains_key(&file.name) {
            let md5 = file.md5_checksum.clone().unwrap_or_default();
            remote_files.insert(file.name.clone(), RemoteFile { id: file.id, md5 });
        }
    }

    let prefix = format!("{kind}/");
    let last: BTreeMap<String, SyncedFile> = state
        .files
        .iter()
        .filter_map(|(key, e)| key.strip_prefix(&prefix).map(|name| (name.to_string(), SyncedFile { remote_id: e.remote_id.clone(), md5: e.md5.clone() })))
        .collect();

    for (name, action) in plan(&local, &remote_files, &last) {
        let key = format!("{prefix}{name}");
        let path = document_path(root, kind, &name)?;
        let label = key.clone();
        let mut record = |remote_id: String, md5: String| state.files.insert(key.clone(), StateEntry { remote_id, md5 });
        match action {
            Action::Record { remote_id } => {
                record(remote_id, local[&name].clone());
            }
            Action::Upload { existing_remote_id } => {
                let content = contents[&name].as_bytes();
                let file = match existing_remote_id {
                    Some(id) => remote.update(&id, content).await?,
                    None => remote.create(folder_id, &name, content).await?,
                };
                record(file.id, md5_hex(content));
                report.uploaded.push(label);
            }
            Action::Download { remote_id } => {
                let bytes = remote.download(&remote_id).await?;
                write_atomic(&path, &String::from_utf8_lossy(&bytes))?;
                record(remote_id, md5_hex(&bytes));
                report.downloaded.push(label);
            }
            Action::Conflict { remote_id } => {
                write_atomic(&conflicts_dir.join(format!("{stamp}-{kind}-{name}")), &contents[&name])?;
                let bytes = remote.download(&remote_id).await?;
                write_atomic(&path, &String::from_utf8_lossy(&bytes))?;
                record(remote_id, md5_hex(&bytes));
                report.conflicts.push(label);
            }
            Action::DeleteLocal => {
                remove_file(&path)?;
                state.files.remove(&key);
                report.deleted_local.push(label);
            }
            Action::DeleteRemote { remote_id } => {
                remote.trash(&remote_id).await?;
                state.files.remove(&key);
                report.deleted_remote.push(label);
            }
            Action::Forget => {
                state.files.remove(&key);
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests;
