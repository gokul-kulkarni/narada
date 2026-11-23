use super::claude::ClaudeParser;
use super::process::LineParser;
use super::types::DetectedAgent;
use crate::shell_env::find_program;
use std::time::Duration;
use tokio::process::Command;

const VERSION_TIMEOUT: Duration = Duration::from_secs(5);

/// How to run one agent CLI. Adding an agent is a new entry here plus its parser.
pub struct AgentSpec {
    pub id: &'static str,
    pub name: &'static str,
    pub program: &'static str,
    /// Arguments for a one-shot, read-only run; the prompt arrives on stdin.
    pub args: &'static [&'static str],
    pub parser: fn() -> Box<dyn LineParser>,
}

pub const AGENTS: &[AgentSpec] = &[AgentSpec {
    id: "claude",
    name: "Claude Code",
    program: "claude",
    args: &[
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        // Read and search only. `--tools` is the allowlist: without it Claude Code still has
        // WebSearch (a way to send data out if a response carries injected instructions),
        // Edit/Write, subagents and more. Plan mode and `--restricted` are a second layer, and
        // keep the user's own settings, hooks and MCP servers out of it.
        "--tools",
        "Read,Grep,Glob",
        "--permission-mode",
        "plan",
        "--restricted",
        "--strict-mcp-config",
        "--no-session-persistence",
    ],
    parser: || Box::new(ClaudeParser::default()),
}];

pub fn find_agent(id: &str) -> Option<&'static AgentSpec> {
    AGENTS.iter().find(|agent| agent.id == id)
}

/// The first version-looking word of `--version` output: "2.1.330 (Claude Code)" → "2.1.330".
pub fn parse_version(output: &str) -> Option<String> {
    output
        .split_whitespace()
        .find(|word| word.starts_with(|c: char| c.is_ascii_digit()))
        .map(str::to_owned)
}

async fn version_of(program: &std::path::Path, path_var: &str) -> Option<String> {
    let output = Command::new(program)
        .arg("--version")
        .env("PATH", path_var)
        .env_remove("CLAUDECODE")
        .kill_on_drop(true)
        .output();
    let output = tokio::time::timeout(VERSION_TIMEOUT, output)
        .await
        .ok()?
        .ok()?;
    output
        .status
        .success()
        .then(|| parse_version(&String::from_utf8_lossy(&output.stdout)))
        .flatten()
}

/// The known agents installed here; one that is missing or whose `--version` fails is left out.
pub async fn detect(path_var: &str) -> Vec<DetectedAgent> {
    let mut found = Vec::new();
    for agent in AGENTS {
        let Some(program) = find_program(agent.program, path_var) else {
            continue;
        };
        if let Some(version) = version_of(&program, path_var).await {
            found.push(DetectedAgent {
                id: agent.id.into(),
                name: agent.name.into(),
                path: program.to_string_lossy().into_owned(),
                version,
            });
        }
    }
    found
}
