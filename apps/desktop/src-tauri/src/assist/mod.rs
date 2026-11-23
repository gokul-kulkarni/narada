//! Agent assist: runs the user's own coding-agent CLI (Claude Code first) on a redacted
//! description of a delivery and streams its answer back. See docs/plans/agent-assist.md.

mod agents;
mod claude;
mod process;
mod types;

pub use types::{AssistEvent, AssistRequest, DetectedAgent};

use crate::shell_env::{effective_path, find_program};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;
use tauri::ipc::Channel;
use tokio::sync::oneshot;

/// Prompts are redacted and truncated before they get here; this only guards against misuse.
const MAX_PROMPT_BYTES: usize = 1024 * 1024;

/// Agent runs in flight, by the id the UI gave each, so they can be stopped.
#[derive(Default)]
pub struct AssistState {
    runs: Mutex<HashMap<String, oneshot::Sender<()>>>,
}

impl AssistState {
    fn runs(
        &self,
    ) -> Result<std::sync::MutexGuard<'_, HashMap<String, oneshot::Sender<()>>>, String> {
        self.runs
            .lock()
            .map_err(|_| "Agent runs are unavailable".to_string())
    }
}

/// An empty folder the agent starts in, so it cannot wander into whatever folder Narada
/// happened to be launched from.
fn agent_workspace(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("No cache folder for the agent: {e}"))?
        .join("assist-workspace");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Could not prepare the agent folder: {e}"))?;
    Ok(dir)
}

#[tauri::command]
pub async fn assist_detect() -> Result<Vec<DetectedAgent>, String> {
    Ok(agents::detect(&effective_path().unwrap_or_default()).await)
}

#[tauri::command]
pub async fn assist_run(
    app: tauri::AppHandle,
    state: tauri::State<'_, AssistState>,
    request: AssistRequest,
    id: String,
    channel: Channel<AssistEvent>,
) -> Result<(), String> {
    let spec = agents::find_agent(&request.agent_id)
        .ok_or_else(|| format!("Unknown agent \"{}\"", request.agent_id))?;
    if request.prompt.trim().is_empty() || request.prompt.len() > MAX_PROMPT_BYTES {
        return Err("The prompt is empty or too large to send.".into());
    }
    let program = find_program(spec.program, &effective_path().unwrap_or_default())
        .ok_or_else(|| format!("{} is not installed, or not on your PATH.", spec.name))?;
    let extra_args = agents::run_args(spec, request.session_id.as_deref())?;
    let cwd = agent_workspace(&app)?;

    let (stop, stopped) = oneshot::channel();
    state.runs()?.insert(id.clone(), stop);
    let plan = process::RunPlan {
        spec,
        program: &program,
        extra_args: &extra_args,
        prompt: &request.prompt,
        cwd: &cwd,
    };
    let result = process::run_agent(plan, process::DEFAULT_LIMITS, stopped, |event| {
        let _ = channel.send(event);
    })
    .await;
    state.runs()?.remove(&id);
    result
}

#[tauri::command]
pub fn assist_cancel(state: tauri::State<'_, AssistState>, id: String) -> Result<(), String> {
    if let Some(stop) = state.runs()?.remove(&id) {
        let _ = stop.send(());
    }
    Ok(())
}

#[cfg(test)]
mod tests;
