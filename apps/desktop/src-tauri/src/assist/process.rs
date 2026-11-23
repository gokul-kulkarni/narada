use super::agents::AgentSpec;
use super::types::AssistEvent;
use crate::shell_env::effective_path;
use std::collections::VecDeque;
use std::path::Path;
use std::process::{ExitStatus, Stdio};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::oneshot;

/// Turns one stdout line of an agent CLI into events.
pub trait LineParser: Send {
    fn line(&mut self, line: &str) -> Vec<AssistEvent>;
}

#[derive(Clone, Copy)]
pub struct RunLimits {
    pub timeout: Duration,
    /// How long a stopped agent gets to exit before it is killed.
    pub grace: Duration,
}

pub const DEFAULT_LIMITS: RunLimits = RunLimits {
    timeout: Duration::from_secs(5 * 60),
    grace: Duration::from_secs(2),
};

const STDERR_TAIL_LINES: usize = 5;

fn describe(duration: Duration) -> String {
    let secs = duration.as_secs();
    if secs >= 60 && secs.is_multiple_of(60) {
        format!("{} min", secs / 60)
    } else {
        format!("{} s", duration.as_secs_f64())
    }
}

fn command(spec: &AgentSpec, program: &Path, cwd: &Path) -> Command {
    let mut command = Command::new(program);
    command
        .args(spec.args)
        .current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // Set when Narada itself was started from a Claude Code terminal.
        .env_remove("CLAUDECODE")
        .kill_on_drop(true);
    if let Some(path) = effective_path() {
        command.env("PATH", path);
    }
    // Its own process group, so stopping it also stops whatever it started.
    #[cfg(unix)]
    command.process_group(0);
    command
}

/// Asks the whole process group to stop, then kills the agent if it hasn't exited in time.
async fn stop(child: &mut Child, grace: Duration) {
    #[cfg(unix)]
    if let Some(pid) = child.id() {
        let _ = Command::new("kill")
            .args(["-TERM", &format!("-{pid}")])
            .status()
            .await;
    }
    if tokio::time::timeout(grace, child.wait()).await.is_err() {
        let _ = child.kill().await;
    }
}

fn exit_error(name: &str, status: ExitStatus, stderr: &[String]) -> AssistEvent {
    let reason = match status.code() {
        Some(code) => format!("{name} exited with code {code}"),
        None => format!("{name} exited unexpectedly"),
    };
    let message = if stderr.is_empty() {
        reason
    } else {
        format!("{reason}: {}", stderr.join("\n"))
    };
    AssistEvent::Error { message }
}

/// Runs one agent with `prompt` on stdin and reports what it says through `emit`. Ends with
/// exactly one of Done, Error or Stopped. Returns Err only if the agent could not start.
pub async fn run_agent(
    spec: &AgentSpec,
    program: &Path,
    prompt: &str,
    cwd: &Path,
    limits: RunLimits,
    cancel: oneshot::Receiver<()>,
    mut emit: impl FnMut(AssistEvent),
) -> Result<(), String> {
    let mut child = command(spec, program, cwd)
        .spawn()
        .map_err(|e| format!("Could not start {}: {e}", spec.name))?;

    let mut stdin = child.stdin.take().ok_or("No stdin for the agent")?;
    let prompt = prompt.to_owned();
    tokio::spawn(async move {
        let _ = stdin.write_all(prompt.as_bytes()).await;
        // Dropping stdin closes it, which tells the agent the prompt is complete.
    });

    let stderr = child.stderr.take().ok_or("No stderr for the agent")?;
    let stderr_tail = tokio::spawn(async move {
        let mut tail = VecDeque::with_capacity(STDERR_TAIL_LINES);
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }
            if tail.len() == STDERR_TAIL_LINES {
                tail.pop_front();
            }
            tail.push_back(line);
        }
        Vec::from(tail)
    });

    let stdout = child.stdout.take().ok_or("No stdout for the agent")?;
    let mut lines = BufReader::new(stdout).lines();
    let mut parser = (spec.parser)();
    let mut finished = false;

    // Only an explicit stop ends the run, not the sender being dropped.
    let cancelled = async move {
        if cancel.await.is_err() {
            std::future::pending::<()>().await;
        }
    };
    tokio::pin!(cancelled);
    let deadline = tokio::time::sleep(limits.timeout);
    tokio::pin!(deadline);

    let status = loop {
        tokio::select! {
            line = lines.next_line() => match line {
                Ok(Some(line)) => {
                    for event in parser.line(&line) {
                        finished |= matches!(event, AssistEvent::Done { .. } | AssistEvent::Error { .. });
                        emit(event);
                    }
                }
                _ => match child.wait().await {
                    Ok(status) => break status,
                    Err(e) => {
                        emit(AssistEvent::Error { message: format!("{} failed: {e}", spec.name) });
                        return Ok(());
                    }
                },
            },
            _ = &mut cancelled => {
                stop(&mut child, limits.grace).await;
                emit(AssistEvent::Stopped);
                return Ok(());
            }
            _ = &mut deadline => {
                stop(&mut child, limits.grace).await;
                emit(AssistEvent::Error {
                    message: format!("{} took longer than {} and was stopped.", spec.name, describe(limits.timeout)),
                });
                return Ok(());
            }
        }
    };

    if !finished {
        if status.success() {
            emit(AssistEvent::Done {
                session_id: None,
                cost_usd: None,
            });
        } else {
            let stderr = stderr_tail.await.unwrap_or_default();
            emit(exit_error(spec.name, status, &stderr));
        }
    }
    Ok(())
}
