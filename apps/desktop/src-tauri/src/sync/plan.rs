//! Pure three-way sync planning: local files vs Drive files vs the state of the last sync.

use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, PartialEq)]
pub struct RemoteFile {
    pub id: String,
    pub md5: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SyncedFile {
    pub remote_id: String,
    pub md5: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Action {
    /// Contents already match; just record them as synced.
    Record {
        remote_id: String,
    },
    Upload {
        existing_remote_id: Option<String>,
    },
    Download {
        remote_id: String,
    },
    DeleteLocal,
    DeleteRemote {
        remote_id: String,
    },
    /// Both sides changed: keep a copy of the local file, then take the remote one.
    Conflict {
        remote_id: String,
    },
    /// Gone on both sides; forget it.
    Forget,
}

pub fn plan(
    local: &BTreeMap<String, String>,
    remote: &BTreeMap<String, RemoteFile>,
    state: &BTreeMap<String, SyncedFile>,
) -> Vec<(String, Action)> {
    let names: BTreeSet<&String> = local
        .keys()
        .chain(remote.keys())
        .chain(state.keys())
        .collect();
    names
        .into_iter()
        .filter_map(|name| {
            let action = decide(local.get(name), remote.get(name), state.get(name))?;
            Some((name.clone(), action))
        })
        .collect()
}

fn decide(
    local: Option<&String>,
    remote: Option<&RemoteFile>,
    last: Option<&SyncedFile>,
) -> Option<Action> {
    use Action::*;
    let action = match (local, remote, last) {
        (Some(l), Some(r), _) if *l == r.md5 => {
            if last.is_some_and(|s| s.md5 == *l && s.remote_id == r.id) {
                return None;
            }
            Record {
                remote_id: r.id.clone(),
            }
        }
        (Some(l), Some(r), Some(s)) if *l == s.md5 => Download {
            remote_id: r.id.clone(),
        },
        (Some(_), Some(r), Some(s)) if r.md5 == s.md5 => Upload {
            existing_remote_id: Some(r.id.clone()),
        },
        (Some(_), Some(r), _) => Conflict {
            remote_id: r.id.clone(),
        },
        // Deleted on Drive: follow the deletion unless the local copy changed since.
        (Some(l), None, Some(s)) if *l == s.md5 => DeleteLocal,
        (Some(_), None, _) => Upload {
            existing_remote_id: None,
        },
        // Deleted locally: follow the deletion unless the Drive copy changed since.
        (None, Some(r), Some(s)) if r.md5 == s.md5 => DeleteRemote {
            remote_id: r.id.clone(),
        },
        (None, Some(r), _) => Download {
            remote_id: r.id.clone(),
        },
        (None, None, Some(_)) => Forget,
        (None, None, None) => return None,
    };
    Some(action)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn local(entries: &[(&str, &str)]) -> BTreeMap<String, String> {
        entries
            .iter()
            .map(|(n, m)| (n.to_string(), m.to_string()))
            .collect()
    }
    fn remote(entries: &[(&str, &str, &str)]) -> BTreeMap<String, RemoteFile> {
        entries
            .iter()
            .map(|(n, id, m)| {
                (
                    n.to_string(),
                    RemoteFile {
                        id: id.to_string(),
                        md5: m.to_string(),
                    },
                )
            })
            .collect()
    }
    fn state(entries: &[(&str, &str, &str)]) -> BTreeMap<String, SyncedFile> {
        entries
            .iter()
            .map(|(n, id, m)| {
                (
                    n.to_string(),
                    SyncedFile {
                        remote_id: id.to_string(),
                        md5: m.to_string(),
                    },
                )
            })
            .collect()
    }
    fn only(
        l: &[(&str, &str)],
        r: &[(&str, &str, &str)],
        s: &[(&str, &str, &str)],
    ) -> Option<Action> {
        let mut actions = plan(&local(l), &remote(r), &state(s));
        assert!(actions.len() <= 1);
        actions.pop().map(|(_, a)| a)
    }

    #[test]
    fn unchanged_files_need_nothing() {
        assert_eq!(
            only(&[("a", "1")], &[("a", "r", "1")], &[("a", "r", "1")]),
            None
        );
    }

    #[test]
    fn identical_files_without_state_are_recorded() {
        assert_eq!(
            only(&[("a", "1")], &[("a", "r", "1")], &[]),
            Some(Action::Record {
                remote_id: "r".into()
            })
        );
    }

    #[test]
    fn one_sided_changes_flow_the_right_way() {
        assert_eq!(
            only(&[("a", "2")], &[("a", "r", "1")], &[("a", "r", "1")]),
            Some(Action::Upload {
                existing_remote_id: Some("r".into())
            })
        );
        assert_eq!(
            only(&[("a", "1")], &[("a", "r", "2")], &[("a", "r", "1")]),
            Some(Action::Download {
                remote_id: "r".into()
            })
        );
    }

    #[test]
    fn both_changed_is_a_conflict() {
        assert_eq!(
            only(&[("a", "2")], &[("a", "r", "3")], &[("a", "r", "1")]),
            Some(Action::Conflict {
                remote_id: "r".into()
            })
        );
        assert_eq!(
            only(&[("a", "2")], &[("a", "r", "3")], &[]),
            Some(Action::Conflict {
                remote_id: "r".into()
            })
        );
    }

    #[test]
    fn new_files_are_copied() {
        assert_eq!(
            only(&[("a", "1")], &[], &[]),
            Some(Action::Upload {
                existing_remote_id: None
            })
        );
        assert_eq!(
            only(&[], &[("a", "r", "1")], &[]),
            Some(Action::Download {
                remote_id: "r".into()
            })
        );
    }

    #[test]
    fn deletions_propagate_only_for_unmodified_files() {
        assert_eq!(
            only(&[("a", "1")], &[], &[("a", "r", "1")]),
            Some(Action::DeleteLocal)
        );
        assert_eq!(
            only(&[("a", "2")], &[], &[("a", "r", "1")]),
            Some(Action::Upload {
                existing_remote_id: None
            })
        );
        assert_eq!(
            only(&[], &[("a", "r", "1")], &[("a", "r", "1")]),
            Some(Action::DeleteRemote {
                remote_id: "r".into()
            })
        );
        assert_eq!(
            only(&[], &[("a", "r", "2")], &[("a", "r", "1")]),
            Some(Action::Download {
                remote_id: "r".into()
            })
        );
        assert_eq!(only(&[], &[], &[("a", "r", "1")]), Some(Action::Forget));
    }

    #[test]
    fn first_sync_never_deletes() {
        let actions = plan(
            &local(&[("a", "1")]),
            &remote(&[("b", "rb", "2")]),
            &BTreeMap::new(),
        );
        assert!(
            actions
                .iter()
                .all(|(_, a)| !matches!(a, Action::DeleteLocal | Action::DeleteRemote { .. }))
        );
        assert_eq!(actions.len(), 2);
    }
}
