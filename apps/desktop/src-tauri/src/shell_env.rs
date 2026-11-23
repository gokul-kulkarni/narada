use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::OnceLock;

/// Apps opened from the Finder get a bare PATH, so `npx`, `uvx`, `claude` and friends would
/// not be found. Ask the login shell for the PATH the user sees in a terminal, once.
pub fn login_path() -> Option<&'static str> {
    static PATH: OnceLock<Option<String>> = OnceLock::new();
    PATH.get_or_init(|| {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
        let output = std::process::Command::new(shell)
            .args(["-l", "-c", "printf %s \"$PATH\""])
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
            .ok()?;
        let path = String::from_utf8(output.stdout).ok()?;
        (!path.trim().is_empty()).then_some(path)
    })
    .as_deref()
}

/// The PATH child processes should get: the login shell's, else this process's own.
pub fn effective_path() -> Option<String> {
    login_path()
        .map(str::to_owned)
        .or_else(|| std::env::var("PATH").ok())
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    path.metadata()
        .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    path.is_file()
}

/// Finds `program` in a PATH-style list of folders, like `command -v`.
pub fn find_program(program: &str, path_var: &str) -> Option<PathBuf> {
    let names: Vec<String> = if cfg!(windows) {
        ["exe", "cmd", "bat"]
            .iter()
            .map(|ext| format!("{program}.{ext}"))
            .collect()
    } else {
        vec![program.to_owned()]
    };
    std::env::split_paths(path_var)
        .flat_map(|dir| names.iter().map(move |name| dir.join(name)))
        .find(|candidate| is_executable(candidate))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn finds_an_executable_on_the_path_and_skips_plain_files() {
        use std::os::unix::fs::PermissionsExt;
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        std::fs::write(first.path().join("tool"), "not executable").unwrap();
        let exe = second.path().join("tool");
        std::fs::write(&exe, "#!/bin/sh\n").unwrap();
        std::fs::set_permissions(&exe, std::fs::Permissions::from_mode(0o755)).unwrap();
        let path_var = std::env::join_paths([first.path(), second.path()]).unwrap();
        assert_eq!(find_program("tool", path_var.to_str().unwrap()), Some(exe));
        assert_eq!(find_program("missing", path_var.to_str().unwrap()), None);
    }
}
