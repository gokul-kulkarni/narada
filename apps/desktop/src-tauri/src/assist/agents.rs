use super::claude::ClaudeParser;
use super::codex::CodexParser;
use super::process::LineParser;
use super::types::DetectedAgent;
use crate::shell_env::find_program;
use std::time::Duration;
use tokio::process::Command;

const VERSION_TIMEOUT: Duration = Duration::from_secs(5);

/// How to run one agent CLI. Adding an agent is a new entry here plus its parser, and only
/// after its read-only limits were checked on a real run (see docs/plans/agent-assist.md).
pub struct AgentSpec {
    pub id: &'static str,
    pub name: &'static str,
    pub program: &'static str,
    /// Arguments for a new read-only conversation; the prompt arrives on stdin.
    pub new_args: fn() -> Vec<String>,
    /// Arguments that continue session `id` with the same limits, if the agent can.
    pub resume_args: Option<fn(&str) -> Vec<String>>,
    /// A settings file that, found in the project folder or a parent, could loosen the limits.
    pub project_config: Option<&'static str>,
    pub parser: fn() -> Box<dyn LineParser>,
}

fn strings(parts: &[&str]) -> Vec<String> {
    parts.iter().map(|part| (*part).to_owned()).collect()
}

const CLAUDE_ARGS: &[&str] = &[
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    // Read and search only. `--tools` is the allowlist: without it Claude Code still has
    // WebSearch (a way to send data out if a response carries injected instructions),
    // Edit/Write, subagents and more. Plan mode and `--restricted` are a second layer, and
    // keep the user's own settings, hooks and MCP servers out of it. Its file tools stay
    // inside the working folder.
    "--tools",
    "Read,Grep,Glob",
    "--permission-mode",
    "plan",
    "--restricted",
    "--strict-mcp-config",
];

/// Codex runs shell commands, so the limits are its sandbox's: a permissions profile that
/// may read only the working folder (plus the system paths a shell needs, which include the
/// temp folders) with no network, and no web search, browser, apps or MCP servers.
/// Never `--sandbox`/`sandbox_mode`: either switches Codex back to its legacy sandbox, whose
/// read-only mode reads the whole disk, and the profile is ignored. Checked on codex-cli 0.171.
/// An unknown `--disable` name is a hard error, so a renamed feature fails loudly.
const CODEX_OPTIONS: &[&str] = &[
    "--json",
    "--skip-git-repo-check",
    "--ignore-user-config",
    "--ignore-rules",
    "-c",
    r#"default_permissions="narada""#,
    "-c",
    r#"permissions.narada.filesystem={":minimal"="read", ":workspace_roots"={"."="read"}}"#,
    "-c",
    r#"web_search="disabled""#,
    "-c",
    "mcp_servers={}",
    "--disable",
    "browser_use",
    "--disable",
    "browser_use_external",
    "--disable",
    "in_app_browser",
    "--disable",
    "apps",
    "--disable",
    "image_generation",
];

pub const AGENTS: &[AgentSpec] = &[
    AgentSpec {
        id: "claude",
        name: "Claude Code",
        program: "claude",
        new_args: || strings(CLAUDE_ARGS),
        resume_args: Some(|id| [strings(CLAUDE_ARGS), strings(&["--resume", id])].concat()),
        project_config: None,
        parser: || Box::new(ClaudeParser::default()),
    },
    AgentSpec {
        id: "codex",
        name: "Codex",
        program: "codex",
        new_args: || [strings(&["exec"]), strings(CODEX_OPTIONS), strings(&["-"])].concat(),
        resume_args: Some(|id| {
            [
                strings(&["exec", "resume"]),
                strings(CODEX_OPTIONS),
                strings(&[id, "-"]),
            ]
            .concat()
        }),
        // A trusted project's Codex settings load even so, and `sandbox_mode` there would
        // replace the profile above.
        project_config: Some(".codex/config.toml"),
        parser: || Box::new(CodexParser::default()),
    },
];

const MAX_SESSION_ID_LEN: usize = 128;

/// Session ids come back from the UI, so they must not be able to pass as a flag.
fn is_session_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= MAX_SESSION_ID_LEN
        && !id.starts_with('-')
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// The full arguments for this run: a new conversation, or continuing `session_id`.
pub fn run_args(spec: &AgentSpec, session_id: Option<&str>) -> Result<Vec<String>, String> {
    let Some(id) = session_id else {
        return Ok((spec.new_args)());
    };
    let resume = spec
        .resume_args
        .ok_or_else(|| format!("{} cannot continue a conversation.", spec.name))?;
    if !is_session_id(id) {
        return Err("That conversation can't be continued; ask again from the start.".into());
    }
    Ok(resume(id))
}

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
