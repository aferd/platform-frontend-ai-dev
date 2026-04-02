# Architecture

This document describes the system architecture of the Dev Bot (Řehoř) — an autonomous agent that picks Jira tickets, implements them, and maintains PRs through review.

## System Overview

```
                                    Jira Cloud
                                   (RHCLOUD project)
                                        |
                                        | REST API (via mcp-atlassian)
                                        |
 ┌──────────────────────────────────────┼─────────────────────────────────────┐
 │  Dev Bot System                      |                                     │
 │                                      v                                     │
 │  ┌──────────────┐    prompt   ┌─────────────┐    MCP (stdio)   ┌────────┐  │
 │  │  Bot Runner  │ ──────────> │ Claude Code │ <──────────────> │  Jira  │  │
 │  │  (Python)    │ <────────── │   (Agent)   │                  │  MCP   │  │
 │  │  bot/run.py  │   result    │             │                  └────────┘  │
 │  └──────┬───────┘             │  CLAUDE.md  │                              │
 │         │                     │  (brain)    │    MCP (SSE)     ┌────────┐  │
 │         │ cost data           │             │ <──────────────> │ Memory │  │
 │         │                     │             │                  │ Server │  │
 │         │                     │             │    MCP (stdio)   │  MCP   │  │
 │         │                     │             │ <──────────────> └───┬────┘  │
 │         │                     │             │                     │        │
 │         │                     │             │    MCP (stdio)   ┌──┴─────┐  │
 │         │                     │             │ <──────────────> │Chrome  │  │
 │         │                     │             │                  │DevTools│  │
 │         │                     │             │    MCP (stdio)   │  MCP   │  │
 │         │                     │             │ <──────────────> └────────┘  │
 │         │                     │             │                              │
 │         │                     │             │  Built-in tools              │
 │         │                     │             │  (Read, Write, Edit,         │
 │         │                     │             │   Bash, Grep, Glob, LSP)     │
 │         │                     └──────┬──────┘                              │
 │         │                            │                                     │
 │         │                   git push / gh pr / glab mr                     │
 │         │                            │                                     │
 │         │                            v                                     │
 │         │                     ┌─────────────┐                              │
 │         │                     │  repos/     │                              │
 │         │                     │  (cloned on │                              │
 │         │                     │   demand)   │                              │
 │         │                     └──────┬──────┘                              │
 │         │                            │                                     │
 └─────────┼────────────────────────────┼─────────────────────────────────────┘
           │                            │
           v                            v
    ┌─────────────┐              GitHub / GitLab
    │Memory Server│              (target repos)
    │  REST API   │
    │  + Dashboard│
    └──────┬──────┘
           │
           v
    ┌─────────────┐
    │ PostgreSQL  │
    │ (pgvector)  │
    └─────────────┘
```

## Components

### Bot Runner (`bot/`)

The Python process that orchestrates the agent loop. It is **not** the brains — it just starts cycles and records results.

| File | Role |
|------|------|
| `run.py` | Main loop: parse args, load config, lock file, poll forever |
| `agent.py` | Wraps the Claude Agent SDK `query()` call. Streams messages, logs tool calls, extracts work context (jira_key, repo, work_type) from MCP tool interceptions |
| `config.py` | Loads `config.json` and merges persona MCP configs |
| `costs.py` | Posts per-cycle cost data to the memory server REST API |

**Cycle flow:**
1. Runner calls `run_cycle()` with the primary label and config
2. Agent SDK spawns a Claude Code subprocess with all MCP servers connected
3. Claude reads `CLAUDE.md` (its full behavioral instructions) and follows the workflow
4. The agent streams back messages — the runner logs them and extracts work context
5. When the cycle ends, the runner calls `record_cost()` and sleeps

The runner uses a file lock (`.lock`) to prevent concurrent instances. It handles SIGINT/SIGTERM for clean shutdown.

### Claude Code (Agent)

The actual intelligence. Claude Code is spawned as a subprocess by the Agent SDK each cycle. It receives:

- **Prompt**: `"Your primary label is: <label>. Follow the instructions in CLAUDE.md."`
- **CLAUDE.md**: detailed behavioral instructions covering the full workflow (priority system, PR maintenance, ticket claiming, implementation guidelines, memory usage, progress tracking)
- **Tools**: Built-in (Read, Write, Edit, Bash, Grep, Glob, LSP) + MCP tools (Jira, memory, browser)
- **Persona prompts**: Loaded from `personas/<type>/prompt.md` based on which repo it's working in

The agent has no persistent state between cycles. All state is stored in the memory server (task records) and reconstructed at the start of each cycle.

### MCP Servers

The agent communicates with external systems through [Model Context Protocol](https://modelcontextprotocol.io/) servers:

| Server | Transport | Purpose |
|--------|-----------|---------|
| **mcp-atlassian** | stdio | Jira CRUD: search tickets, read/update issues, transitions, comments, sprints |
| **bot-memory** | SSE (HTTP) | Task tracking (5 concurrent max) + RAG memory (vector search over past learnings) |
| **chrome-devtools** | stdio | Browser automation for visual verification — navigate pages, take screenshots |
| **hcc-patternfly-data-view** | stdio | PatternFly component docs (only loaded for frontend persona repos) |

MCP servers are configured in two places:
- `.mcp.json` — project-level servers (Jira, memory, browser) loaded every cycle
- `personas/*/mcp.json` — per-persona servers loaded only when that persona is active

### Memory Server (`memory-server/`)

A FastMCP + Starlette application backed by PostgreSQL with pgvector. Serves two roles:

**1. MCP Server** — exposes tools to the agent:
- `task_add`, `task_update`, `task_get`, `task_list`, `task_remove`, `task_check_capacity` — structured work tracking with status, PR links, branch names, progress metadata
- `memory_store`, `memory_search`, `memory_list`, `memory_delete` — RAG knowledge base with auto-generated embeddings for semantic search
- `bot_status_update` — live status banner for the dashboard

**2. REST API + Dashboard** (port 8080) — web UI for humans:
- Task and memory browsing with detail panels
- Semantic search over stored memories
- 3D PCA-projected embedding visualization
- Cost charts with per-cycle breakdowns by work type
- Live WebSocket updates (toast notifications when the bot modifies data)

Runs as two Docker containers:
- `postgres` — pgvector/pgvector:pg17 (port 5433 externally, 5432 internally)
- `memory-server` — Python app (port 8080)

### Personas (`personas/`)

Domain-specific guidelines that tell the agent how to work in different types of repos. Each persona is a markdown file with coding standards, testing commands, and conventions.

| Persona | Repos | Key Details |
|---------|-------|-------------|
| `frontend` | React/TS/PatternFly apps | `npm run lint/test`, visual verification via browser MCP, PatternFly component MCP |
| `backend` | Go and Node.js services | `make test` / `npm test`, Go conventions |
| `rbac` | insights-rbac (Django/DRF) | Docker Compose dev env, `make unittest-fast`, PostgreSQL + Redis + Celery |
| `operator` | Kubernetes operators | Go, controller-runtime patterns |
| `config` | app-interface | GitLab fork workflow, read-only or MR-based |
| `cve` | CVE remediation | Dependency upgrades, grype scanning |

A repo can have multiple personas (e.g. `["frontend", "cve"]`). The agent picks the best fit based on the ticket description.

### Target Repos (`repos/`)

Cloned on demand when the bot picks up a ticket. Repo metadata is in `project-repos.json`:

```json
{
  "notifications-frontend": {
    "url": "git@github.com:RedHatInsights/notifications-frontend.git",
    "personas": ["frontend", "cve"]
  },
  "app-interface": {
    "url": "git@gitlab.cee.redhat.com:yourfork/app-interface.git",
    "upstream": "git@gitlab.cee.redhat.com:service/app-interface.git",
    "personas": ["config"],
    "host": "gitlab"
  }
}
```

Fields:
- `url` — git clone URL (may be a fork)
- `upstream` — (optional) original repo URL. Bot syncs from upstream, pushes to fork, opens MRs against upstream
- `personas` — applicable persona types
- `host` — `"gitlab"` for GitLab repos (default: GitHub)
- `readonly` — if `true`, bot reads only, never pushes

## Data Flow

### New Ticket Flow

```
Jira ticket (labeled, unassigned)
    │
    ├─ Bot searches: JQL with primary label + assignee is EMPTY
    ├─ Bot assigns itself, transitions to "In Progress"
    ├─ Bot searches RAG memory for relevant past learnings
    ├─ Bot clones/fetches repo, creates branch bot/<TICKET-KEY>
    ├─ Bot reads persona prompt, repo CLAUDE.md
    ├─ Bot implements (Edit, Write, Bash, LSP)
    ├─ Bot runs tests (npm test / make unittest-fast / etc.)
    ├─ Bot runs lint
    ├─ [If UI change] Bot starts dev server, takes screenshots via chrome-devtools
    ├─ Bot commits, pushes, opens PR (gh pr create / glab mr create)
    ├─ Bot transitions ticket to "Code Review"
    ├─ Bot comments on Jira with PR link
    ├─ Bot stores task record in memory server
    └─ Cycle ends
```

### PR Maintenance Flow (next cycle)

```
Bot checks tracked tasks
    │
    ├─ Failing CI?  → checkout branch, fix, push
    ├─ Merge conflict? → rebase, force push
    ├─ New review comments? → address each, push, reply
    ├─ New Jira comments? → respond or implement changes
    ├─ PR merged? → transition ticket to Done, store learnings
    └─ All clean? → look for new work
```

### Cost Tracking Flow

```
Agent cycle completes
    │
    ├─ Agent SDK returns ResultMessage with usage data
    ├─ Bot runner extracts: tokens, cost, duration, turns
    ├─ Bot runner adds work context: jira_key, repo, work_type, summary
    ├─ POST to memory server REST API (/api/costs)
    ├─ Memory server stores in PostgreSQL
    ├─ Memory server publishes WebSocket event
    └─ Dashboard updates live
```

## Authentication & Credentials

| Service | Auth Method | Config |
|---------|-------------|--------|
| Claude (Vertex AI) | GCP service account key | `sa-key.json` + env vars in `.env` |
| Jira | API token | `JIRA_URL`, `JIRA_USERNAME`, `JIRA_API_TOKEN` in `.env` |
| GitHub | SSH key + PAT (`GH_TOKEN`) | SSH for git ops, PAT for gh CLI API calls |
| GitLab | SSH key | `glab auth login` (one-time setup, SSH protocol) |
| Memory server | None (localhost) | Hardcoded `http://localhost:8080` |
| Chrome DevTools | None (localhost) | Hardcoded `http://127.0.0.1:9222` |

## Deployment Considerations (Cluster)

The system is currently designed for single-machine operation. For cluster deployment:

### Pod architecture

The system deploys as **separate pods**:

- **Bot pods** — one per label/team. Each runs the Python runner + Claude Code agent. Handles all git operations, Jira interaction, and code implementation.
- **Memory server pod** — a single shared instance running the FastMCP app + PostgreSQL. All bot pods connect to it over the cluster network. Traffic is low (a few API calls per cycle), so a single instance is sufficient.

This keeps the deployment simple — one memory server serves all bot instances, and each bot is independently scalable by adding new pods with different labels.

### Container images

Both images use Red Hat UBI9 base images:

- **Bot container** (`Dockerfile`) — `ubi9/ubi` with Python 3.12, Node.js 22 (NodeSource), Chromium headless (EPEL), gh CLI, glab CLI, uv. Runs as non-root `botuser` (Claude Code rejects root). Entrypoint decodes secrets from env vars (SSH key, GPG key, SA key), starts Chromium in background, then launches the bot runner.

- **Memory server** (`memory-server/Dockerfile`) — multi-stage build. Stage 1: `ubi9/nodejs-22` builds the React dashboard. Stage 2: `ubi9/python-312-minimal` runs the FastMCP app with dashboard assets baked in.

### What needs to change for cluster

1. **Memory server** — PostgreSQL connection string pointing to RDS instance instead of local container. Cluster-internal service for bot pods to reach it (e.g. `memory-server:8080`).

2. **Multiple labels** — each label runs as a separate bot container. All bot containers share a single memory server pod (low traffic, no need to replicate).

### What stays the same

- `CLAUDE.md` and personas — baked into the bot image or mounted as a ConfigMap
- `project-repos.json` — mounted as config
- `.mcp.json` — mounted, with URLs pointing to cluster-internal services (e.g. `http://memory-server:8080`)
- Cost tracking — same REST API, just different base URL

### Network topology (target)

```
┌─────────────────────────────────────┐
│  Cluster (Kubernetes / OpenShift)   │
│                                     │
│  ┌─────────────┐  ┌─────────────┐   │
│  │ Bot Pod     │  │ Bot Pod     │   │
│  │ (label A)   │  │ (label B)   │   │
│  └──────┬──────┘  └──────┬──────┘   │
│         │                │          │
│         └───────┬────────┘          │
│                 │ MCP (SSE)         │
│                 v                   │
│  ┌──────────────────────────┐       │
│  │ Memory Server Pod        │       │
│  │  ┌────────────┐          │       │
│  │  │ Memory App │          │       │
│  │  │ (MCP+API)  │──────┐   │       │
│  │  └────────────┘      │   │       │
│  └──────────────────────┼───┘       │
│                         │           │
│                         v           │
│                  ┌────────────┐     │
│                  │ RDS (PG)   │     │
│                  │ (pgvector) │     │
│                  └────────────┘     │
│                                     │
│  (Chromium headless runs inside     │
│   each bot pod on port 9222)        │
│                                     │
└──────────────────────┬──────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        v              v              v
   Jira Cloud    GitHub/GitLab   Vertex AI
```

### Secrets required

| Secret | Env var | Used by |
|--------|---------|---------|
| SSH private key (base64) | `SSH_PRIVATE_KEY_B64` | Bot — git clone/push over SSH |
| GPG private key (base64) | `GPG_PRIVATE_KEY_B64` | Bot — commit signing |
| GitHub PAT | `GH_TOKEN` | Bot — gh CLI (PR creation, reviews, comments) |
| GCP service account key (base64) | `GOOGLE_SA_KEY_B64` | Bot — Claude API via Vertex AI |
| Jira credentials | `JIRA_URL`, `JIRA_USERNAME`, `JIRA_API_TOKEN` | Bot — mcp-atlassian MCP server |
| RDS PostgreSQL credentials | `DATABASE_URL` | Memory server |

### Scaling

- Each bot instance handles one label (team). Multiple instances can run in parallel.
- All instances share the memory server (cross-team learnings are possible).
- Hard cap of 5 concurrent tasks per bot instance (enforced by memory server).
- Cycles are sequential within a bot — no concurrency within a single instance.
- Idle interval (1 hour) keeps costs low when there's no work.