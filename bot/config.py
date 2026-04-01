"""Configuration loading for the dev bot."""

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Config:
    model: str
    max_turns: int
    interval: int
    idle_interval: int
    board_key: str


def load_config(script_dir: Path) -> Config:
    """Load bot configuration from config.json."""
    with open(script_dir / "config.json") as f:
        raw = json.load(f)
    return Config(
        model=raw["claude"]["model"],
        max_turns=raw["claude"]["maxTurns"],
        interval=raw["polling"]["intervalSeconds"],
        idle_interval=raw["polling"].get("idleIntervalSeconds", 3600),
        board_key=raw["jira"]["boardKey"],
    )


def load_mcp_servers(script_dir: Path) -> dict:
    """Load and merge MCP servers from persona configs.

    The root .mcp.json (bot-memory, chrome-devtools, mcp-atlassian) is loaded
    automatically by the SDK via setting_sources=["project"]. This function
    only loads additional per-persona MCP servers.
    """
    servers: dict = {}
    for mcp_file in sorted(script_dir.glob("personas/*/mcp.json")):
        with open(mcp_file) as f:
            data = json.load(f)
        for name, cfg in data.get("mcpServers", {}).items():
            servers[name] = cfg
    return servers


ALLOWED_TOOLS = [
    # Built-in tools
    "Edit", "Write", "Read", "Glob", "Grep", "Bash", "LSP",
    # Jira MCP tools
    "mcp__mcp-atlassian__jira_search",
    "mcp__mcp-atlassian__jira_get_issue",
    "mcp__mcp-atlassian__jira_add_comment",
    "mcp__mcp-atlassian__jira_update_issue",
    "mcp__mcp-atlassian__jira_get_transitions",
    "mcp__mcp-atlassian__jira_transition_issue",
    "mcp__mcp-atlassian__jira_get_user_profile",
    "mcp__mcp-atlassian__jira_download_attachments",
    "mcp__mcp-atlassian__jira_get_agile_boards",
    "mcp__mcp-atlassian__jira_get_sprints_from_board",
    "mcp__mcp-atlassian__jira_add_issues_to_sprint",
    "mcp__mcp-atlassian__jira_create_issue",
    "mcp__mcp-atlassian__jira_get_field_options",
    # Wildcard MCP tools
    "mcp__hcc-patternfly-data-view__*",
    "mcp__chrome-devtools__*",
    "mcp__bot-memory__*",
]
