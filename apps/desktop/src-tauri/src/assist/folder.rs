use std::path::{Path, PathBuf};

const TOO_BROAD: &str = "Choose a project folder, not the whole disk or your home folder.";
const MISSING: &str = "That project folder doesn't exist any more.";

/// The folder an agent may read, checked. Claude Code limits its file tools to its working
/// folder, so this is the boundary of what it can see: never the disk root or the home
/// folder itself (with ~/.ssh and the rest), and always a real folder.
pub fn project_folder(path: &str, home: &Path) -> Result<PathBuf, String> {
    let path = Path::new(path);
    if !path.is_absolute() {
        return Err("Choose a full folder path.".into());
    }
    let folder = path.canonicalize().map_err(|_| MISSING.to_string())?;
    if !folder.is_dir() {
        return Err(MISSING.into());
    }
    let home = home.canonicalize().unwrap_or_else(|_| home.to_path_buf());
    if folder.parent().is_none() || folder == home {
        return Err(TOO_BROAD.into());
    }
    Ok(folder)
}

/// Whether `relative` (e.g. `.codex/config.toml`) exists in `folder` or a parent, stopping
/// before the home folder, whose own settings file is the user's and is handled separately.
pub fn has_project_config(folder: &Path, relative: &str, home: &Path) -> bool {
    let canonical = |path: &Path| path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let (folder, home) = (canonical(folder), canonical(home));
    folder
        .ancestors()
        .take_while(|dir| *dir != home)
        .any(|dir| dir.join(relative).is_file())
}
