# Standard Operating Procedures

## Creating a GitHub Bot Identity

Step-by-step guide for setting up a new bot account on GitHub with SSH and GPG signing.

### 1. Create the GitHub account

Sign up at github.com with a dedicated bot email.
Choose a recognizable username.

### 2. Generate an SSH key

```bash
ssh-keygen -t ed25519 -C "<bot-email>" -f .ssh/id_ed25519
```

Add the **public** key (`.ssh/id_ed25519.pub`) to the bot's GitHub account:
GitHub > Settings > SSH and GPG keys > New SSH key.

### 3. Generate a GPG key for commit signing

```bash
gpg --quick-gen-key "<bot-username> <<bot-email>>" ed25519 sign 0
```

Export the keys:
```bash
# Public key — add to GitHub account
gpg --armor --export "<bot-username>" > .ssh/gpg-public.asc

# Private key — store securely for container injection
gpg --armor --export-secret-keys "<bot-username>" > .ssh/gpg-private.asc
```

Add the **public** key (`gpg-public.asc`) to the bot's GitHub account:
GitHub > Settings > SSH and GPG keys > New GPG key.

### 4. Create a Personal Access Token

Go to https://github.com/settings/tokens (logged in as the bot account).

Create a classic token with these scopes:
- `repo` — full repo access (PRs, code, status)

The token is used by the `gh` CLI for GitHub API calls (creating PRs, posting comments, reading reviews). Git push/pull uses SSH, not the token.

### 5. Store secrets

Three secrets are needed for deployment:

| Secret | How to generate | Used by |
|--------|----------------|---------|
| `SSH_PRIVATE_KEY_B64` | `base64 -i .ssh/id_ed25519` | git push/pull over SSH |
| `GPG_PRIVATE_KEY_B64` | `base64 -i .ssh/gpg-private.asc` | commit signing |
| `GH_TOKEN` | PAT from step 4 | `gh` CLI (GitHub API) |

Store these in your secret management system (OpenShift secrets, Vault, etc.).

### 6. Set environment variables

The container expects three secrets as env vars. Set them before running:

```bash
# Encode SSH private key as base64
export SSH_PRIVATE_KEY_B64=$(base64 -i .ssh/id_ed25519)

# Encode GPG private key as base64
export GPG_PRIVATE_KEY_B64=$(base64 -i .ssh/gpg-private.asc)

# GitHub Personal Access Token (from step 4)
export GH_TOKEN=<pat-token>
```

For persistent use, add these to a `.env` file (already gitignored):

```bash
SSH_PRIVATE_KEY_B64=<base64-encoded-ssh-key>
GPG_PRIVATE_KEY_B64=<base64-encoded-gpg-key>
GH_TOKEN=<pat-token>
```

Docker Compose automatically reads `.env` from the project root.

For OpenShift, store these as secrets and inject them as env vars into the pod.

### 7. Verify inside the container

Build and enter the container:

```bash
docker compose run --rm bot
```

Run these checks:

```bash
# SSH auth
ssh -T git@github.com
# Expected: "Hi <bot-username>! You've successfully authenticated..."

# GH CLI
gh auth status
# Expected: "Logged in to github.com account <bot-username>"

# GPG signing
git init /tmp/test && cd /tmp/test && git commit --allow-empty -m "test sign"
# Expected: commit succeeds (signed)

# Clone a repo
git clone git@github.com:<org>/<repo>.git /tmp/test-clone
# Expected: clones without errors
```

### 8. Grant repo access

Add the bot account as a collaborator (or team member) to each repo it needs to push to. The bot needs write access to create branches and open PRs.

For org repos, an org admin must invite the bot account to the appropriate team.
