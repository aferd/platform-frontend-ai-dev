"""Core agent cycle — invokes Claude Agent SDK."""

import logging

import httpx
from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ResultMessage,
    SystemMessage,
    TextBlock,
    query,
)

from .config import Config

logger = logging.getLogger(__name__)

DASHBOARD_URL = "http://localhost:8080/api/bot-status"


async def _push_status(
    client: httpx.AsyncClient,
    state: str,
    message: str,
    jira_key: str | None = None,
    repo: str | None = None,
) -> None:
    """Push a status update to the dashboard banner via HTTP."""
    try:
        await client.post(
            DASHBOARD_URL,
            json={"state": state, "message": message, "jira_key": jira_key, "repo": repo},
            timeout=2.0,
        )
    except Exception:
        pass  # Dashboard may be down — don't break the bot


def _describe_tool_use(block) -> str:
    """Build a human-readable description of a tool call."""
    name = block.name
    inp = block.input if hasattr(block, "input") else {}

    if name == "Bash":
        cmd = inp.get("command", "")
        return f"Bash: {cmd[:120]}"
    elif name in ("Read", "Write"):
        path = inp.get("file_path", "")
        return f"{name}: {path}"
    elif name == "Edit":
        path = inp.get("file_path", "")
        return f"Edit: {path}"
    elif name == "Glob":
        pattern = inp.get("pattern", "")
        return f"Glob: {pattern}"
    elif name == "Grep":
        pattern = inp.get("pattern", "")
        return f"Grep: {pattern}"
    elif name.startswith("mcp__"):
        # mcp__bot-memory__task_list → bot-memory: task_list
        parts = name.split("__", 2)
        if len(parts) == 3:
            server, tool = parts[1], parts[2]
            # Include first useful arg if available
            arg_summary = ""
            if inp:
                first_key = next(iter(inp), None)
                if first_key:
                    val = str(inp[first_key])[:60]
                    arg_summary = f" ({first_key}={val})"
            return f"{server}: {tool}{arg_summary}"
        return name
    else:
        return name


async def run_cycle(
    label: str,
    config: Config,
    mcp_servers: dict,
    allowed_tools: list[str],
    cwd: str,
) -> ResultMessage | None:
    """Run a single bot cycle via the Claude Agent SDK."""
    options = ClaudeAgentOptions(
        model=config.model,
        max_turns=config.max_turns,
        allowed_tools=allowed_tools,
        mcp_servers=mcp_servers,
        setting_sources=["project"],
        cwd=cwd,
        permission_mode="bypassPermissions",
    )

    prompt = (
        f"Your primary label is: {label}. "
        "Follow the instructions in CLAUDE.md."
    )

    result = None

    async with httpx.AsyncClient() as http:
        # Signal cycle start to dashboard
        await _push_status(http, "working", "Starting cycle...")

        try:
            async for message in query(prompt=prompt, options=options):
                if isinstance(message, SystemMessage) and message.subtype == "init":
                    mcp_status = message.data.get("mcp_servers", [])
                    connected = []
                    for srv in mcp_status:
                        status = srv.get("status", "unknown")
                        name = srv.get("name", "?")
                        if status != "connected":
                            logger.warning("MCP %s: %s", name, status)
                        else:
                            connected.append(name)
                    if connected:
                        logger.info("MCP connected: %s", ", ".join(connected))

                elif isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, TextBlock):
                            text = block.text.strip()
                            if text:
                                # Log full text (truncated)
                                logger.info("[agent] %s", text[:300])
                                # Push to dashboard (shorter)
                                await _push_status(
                                    http, "working", text[:150]
                                )
                        elif hasattr(block, "name"):
                            desc = _describe_tool_use(block)
                            logger.info("[tool] %s", desc)

                elif isinstance(message, ResultMessage):
                    result = message
                    cost = (
                        f"${message.total_cost_usd:.4f}"
                        if message.total_cost_usd is not None
                        else "N/A"
                    )
                    logger.info(
                        "Cycle done: %s | turns=%s | cost=%s | duration=%sms",
                        message.subtype,
                        message.num_turns,
                        cost,
                        message.duration_ms,
                    )

        except Exception:
            logger.exception("Agent cycle failed")
            await _push_status(http, "error", "Cycle failed — check bot.log")

        # Signal cycle end
        result_text = getattr(result, "result", "") or ""
        if "NO_WORK_FOUND" in result_text:
            await _push_status(http, "idle", "No work found. Sleeping...")
        else:
            await _push_status(http, "idle", "Cycle complete. Sleeping...")

    return result
