use super::*;
use crate::sync::drive::DriveFile;
use std::cell::RefCell;
use std::fs;

/// In-memory Drive: folders by (name, parent), files by id.
#[derive(Default)]
struct FakeDrive {
    folders: RefCell<Vec<(String, String, String)>>,
    files: RefCell<BTreeMap<String, (String, String, Vec<u8>)>>,
    next: RefCell<u32>,
}

impl FakeDrive {
    fn id(&self) -> String {
        *self.next.borrow_mut() += 1;
        format!("id{}", self.next.borrow())
    }
    fn file(&self, id: &str, name: &str, bytes: &[u8]) -> DriveFile {
        DriveFile { id: id.into(), name: name.into(), md5_checksum: Some(md5_hex(bytes)), modified_time: None }
    }
    fn names_in(&self, folder: &str) -> Vec<String> {
        self.files.borrow().values().filter(|(_, f, _)| f == folder).map(|(n, _, _)| n.clone()).collect()
    }
    fn put(&self, folder: &str, name: &str, bytes: &[u8]) -> String {
        let id = self.id();
        self.files.borrow_mut().insert(id.clone(), (name.into(), folder.into(), bytes.to_vec()));
        id
    }
}

impl Remote for FakeDrive {
    async fn find_or_create_folder(&self, name: &str, parent: Option<&str>) -> Result<String, String> {
        let parent = parent.unwrap_or("root").to_string();
        if let Some((_, _, id)) = self.folders.borrow().iter().find(|(n, p, _)| n == name && *p == parent) {
            return Ok(id.clone());
        }
        let id = self.id();
        self.folders.borrow_mut().push((name.into(), parent, id.clone()));
        Ok(id)
    }
    async fn list(&self, folder_id: &str) -> Result<Vec<DriveFile>, String> {
        Ok(self.files.borrow().iter().filter(|(_, (_, f, _))| f == folder_id).map(|(id, (n, _, b))| self.file(id, n, b)).collect())
    }
    async fn download(&self, file_id: &str) -> Result<Vec<u8>, String> {
        self.files.borrow().get(file_id).map(|(_, _, b)| b.clone()).ok_or("missing".into())
    }
    async fn create(&self, folder_id: &str, name: &str, content: &[u8]) -> Result<DriveFile, String> {
        let id = self.put(folder_id, name, content);
        Ok(self.file(&id, name, content))
    }
    async fn update(&self, file_id: &str, content: &[u8]) -> Result<DriveFile, String> {
        let mut files = self.files.borrow_mut();
        let entry = files.get_mut(file_id).ok_or("missing")?;
        entry.2 = content.to_vec();
        Ok(DriveFile { id: file_id.into(), name: entry.0.clone(), md5_checksum: Some(md5_hex(content)), modified_time: None })
    }
    async fn trash(&self, file_id: &str) -> Result<(), String> {
        self.files.borrow_mut().remove(file_id).map(|_| ()).ok_or("missing".into())
    }
}

struct Setup {
    drive: FakeDrive,
    root: tempfile::TempDir,
    conflicts: tempfile::TempDir,
    state: SyncState,
}

impl Setup {
    fn new() -> Self {
        let root = tempfile::tempdir().unwrap();
        crate::storage::files::ensure_layout(root.path()).unwrap();
        Self { drive: FakeDrive::default(), root, conflicts: tempfile::tempdir().unwrap(), state: SyncState::default() }
    }
    fn local(&self, rel: &str) -> std::path::PathBuf {
        self.root.path().join(rel)
    }
    async fn sync(&mut self) -> SyncReport {
        sync(&self.drive, self.root.path(), self.conflicts.path(), &mut self.state, "t").await.unwrap()
    }
    fn folder(&self, kind: &str) -> String {
        self.state.folder_ids[kind].clone()
    }
}

#[tokio::test]
async fn first_sync_uploads_local_files_and_creates_folders() {
    let mut s = Setup::new();
    fs::write(s.local("Collections/a.json"), "{\"a\":1}").unwrap();
    let report = s.sync().await;
    assert_eq!(report.uploaded, ["collections/a.json"]);
    assert_eq!(s.drive.names_in(&s.folder("collections")), ["a.json"]);
    let folders: Vec<String> = s.drive.folders.borrow().iter().map(|(n, _, _)| n.clone()).collect();
    assert_eq!(folders, ["free-postman", "Collections", "Environments"]);
    assert_eq!(s.sync().await, SyncReport::default(), "second sync is a no-op");
}

#[tokio::test]
async fn downloads_remote_changes_and_propagates_deletions() {
    let mut s = Setup::new();
    s.sync().await;
    let env_folder = s.folder("environments");
    let id = s.drive.put(&env_folder, "e.json", b"{\"v\":1}");
    assert_eq!(s.sync().await.downloaded, ["environments/e.json"]);
    assert_eq!(fs::read_to_string(s.local("Environments/e.json")).unwrap(), "{\"v\":1}");

    s.drive.update(&id, b"{\"v\":2}").await.unwrap();
    assert_eq!(s.sync().await.downloaded, ["environments/e.json"]);

    fs::remove_file(s.local("Environments/e.json")).unwrap();
    assert_eq!(s.sync().await.deleted_remote, ["environments/e.json"]);
    assert!(s.drive.names_in(&env_folder).is_empty());
}

#[tokio::test]
async fn remote_deletion_removes_the_local_file() {
    let mut s = Setup::new();
    fs::write(s.local("Collections/a.json"), "{}").unwrap();
    s.sync().await;
    let id = s.state.files["collections/a.json"].remote_id.clone();
    s.drive.trash(&id).await.unwrap();
    assert_eq!(s.sync().await.deleted_local, ["collections/a.json"]);
    assert!(!s.local("Collections/a.json").exists());
    assert!(s.state.files.is_empty());
}

#[tokio::test]
async fn conflicts_keep_a_local_copy_and_take_the_remote_version() {
    let mut s = Setup::new();
    fs::write(s.local("Collections/a.json"), "base").unwrap();
    s.sync().await;
    let id = s.state.files["collections/a.json"].remote_id.clone();
    s.drive.update(&id, b"remote").await.unwrap();
    fs::write(s.local("Collections/a.json"), "local").unwrap();

    let report = s.sync().await;
    assert_eq!(report.conflicts, ["collections/a.json"]);
    assert_eq!(fs::read_to_string(s.local("Collections/a.json")).unwrap(), "remote");
    assert_eq!(fs::read_to_string(s.conflicts.path().join("t-collections-a.json")).unwrap(), "local");
}

#[tokio::test]
async fn ignores_remote_files_with_unsafe_names() {
    let mut s = Setup::new();
    s.sync().await;
    s.drive.put(&s.folder("collections"), "../evil.json", b"x");
    assert_eq!(s.sync().await, SyncReport::default());
}

#[test]
fn state_round_trips() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("sync-state.json");
    assert_eq!(load_state(&path).unwrap(), SyncState::default());
    let mut state = SyncState::default();
    state.files.insert("collections/a.json".into(), StateEntry { remote_id: "r".into(), md5: "m".into() });
    save_state(&path, &state).unwrap();
    assert_eq!(load_state(&path).unwrap(), state);
    assert_eq!(md5_hex(b""), "d41d8cd98f00b204e9800998ecf8427e");
}
