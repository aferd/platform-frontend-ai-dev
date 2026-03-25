# Dev Bot

**Status: Proof of Concept**

An autonomous developer bot that picks groomed Jira tickets and implements them using Claude CLI. It maintains its own PRs (fixing CI, resolving conflicts, addressing review feedback) before picking up new work.

## How it works

The bot runs in a loop with two priorities:

### Priority 1: Maintain existing PRs
Before looking for new work, the bot checks its open PRs (tracked in `state/open-prs.json`):
- Fixes failing CI checks
- Resolves merge conflicts
- Addresses PR review feedback
- Removes merged/closed PRs from tracking

### Priority 2: Pick new Jira work
Only when no PRs need attention, the bot searches for groomed tickets:
1. Queries Jira for unassigned tickets with `platform-experience-services` + `hcc-ai-framework` labels
2. Matches the ticket's `repo:<name>` label to a repo in `project-repos.json`
3. Loads the persona (e.g. `frontend`) for repo-specific guidelines and MCP tools
4. Implements the change, pushes a branch, opens a PR via `gh`
5. Comments on the Jira ticket with a link to the PR

If no work is found, the bot sleeps for 1 hour before checking again.

## Jira grooming

Tickets are not picked randomly from the backlog. They must be explicitly groomed for the bot:

- **Label `hcc-ai-framework`** — marks the ticket as bot-eligible
- **Label `repo:<name>`** — identifies the target repository (must match a key in `project-repos.json`)
- **Label `platform-experience-services`** — team/project scope
- **Clear description** — the ticket must have a clear description of the task and acceptance criteria
- **Unassigned** — the bot only picks unassigned tickets

Example: [RHCLOUD-46011](https://redhat.atlassian.net/browse/RHCLOUD-46011)

## Structure

```
dev-bot/
  run.sh                 # Main polling loop — launches Claude CLI
  init.sh                # Clones all repos, installs LSP dependencies
  config.json            # Jira board, model, polling intervals
  project-repos.json     # repo label -> git URL + persona mapping
  CLAUDE.md              # Agent instructions (full workflow)
  state/
    open-prs.json        # Tracks bot's open PRs for maintenance
  prompts/
    default.md           # Default coding guidelines
  personas/
    frontend/
      prompt.md          # React/TS/PatternFly guidelines
      mcp.json           # PatternFly MCP server config
    backend/
      prompt.md          # Backend guidelines
```

## Prerequisites

- [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- `gh` CLI authenticated with GitHub
- SSH access to target repos
- Jira MCP server configured globally (`mcp-atlassian`)
- Node.js + npm (for TypeScript LSP and frontend repos)
- `jq`

## Setup

```bash
# Clone this repo
git clone git@github.com:<org>/dev-bot.git
cd dev-bot

# Clone all target repos and install LSP deps
./init.sh

# Run the bot
./run.sh
```

## Adding a new repo

1. Add an entry to `project-repos.json`:
   ```json
   "my-repo": {
     "url": "git@github.com:RedHatInsights/my-repo.git",
     "persona": "frontend"
   }
   ```
2. Add a `repo:my-repo` label to the Jira ticket
3. Run `./init.sh` to clone it

## Example

- Jira ticket: [RHCLOUD-46011](https://redhat.atlassian.net/browse/RHCLOUD-46011)
- PR created by the bot: [astro-virtual-assistant-frontend#368](https://github.com/RedHatInsights/astro-virtual-assistant-frontend/pull/368)

## Next steps

- **Containerize**: Create a container image with all dependencies (Claude CLI, gh, Node.js, LSP servers, jq) pre-installed and verify the full workflow runs inside it
- **Claude service account**: Set up a dedicated Claude API/Jira bot account instead of using personal credentials
- **Deployment**: Deploy the container to a persistent environment (OpenShift, Kubernetes, etc.) with cron-based scheduling
- **Expand personas**: Add specialized personas for different task types (CVE remediation, dependency updates, test migration, etc.)
