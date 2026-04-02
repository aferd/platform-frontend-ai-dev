FROM python:3.12-slim

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    openssh-client \
    gnupg \
    curl \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Node.js (for Claude Code runtime + LSP)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# gh CLI
RUN ARCH=$(dpkg --print-architecture) \
    && curl -fsSL "https://github.com/cli/cli/releases/download/v2.67.0/gh_2.67.0_linux_${ARCH}.tar.gz" \
    | tar -xz -C /usr/local --strip-components=1

# glab CLI
RUN ARCH=$(dpkg --print-architecture) \
    && curl -fsSL "https://gitlab.com/gitlab-org/cli/-/releases/v1.51.0/downloads/glab_1.51.0_linux_${ARCH}.tar.gz" \
    | tar -xz -C /usr/local/bin --strip-components=2 bin/glab

# uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
    && cp /root/.local/bin/uv /usr/local/bin/uv \
    && cp /root/.local/bin/uvx /usr/local/bin/uvx

# Non-root user (Claude Code rejects root)
RUN useradd -m -s /bin/bash botuser
WORKDIR /home/botuser/app

# Copy project files and install Python deps (as root so uv is available)
COPY pyproject.toml uv.lock* ./
COPY bot/ bot/
RUN uv sync --frozen --no-dev
ENV PATH="/home/botuser/app/.venv/bin:$PATH"
ENV CLAUDE_CODE_USE_VERTEX=1
ENV VERTEX_LOCATION=global

# Copy bot config files
COPY config.json project-repos.json CLAUDE.md .mcp.json ./
COPY .claude/ .claude/
COPY personas/ personas/

# Fix ownership
RUN chown -R botuser:botuser /home/botuser/app

USER botuser

# SSH config
RUN mkdir -p /home/botuser/.ssh && chmod 700 /home/botuser/.ssh
RUN echo "Host github.com\n  IdentityFile /home/botuser/.ssh/id_ed25519\n  StrictHostKeyChecking accept-new\n\nHost gitlab.cee.redhat.com\n  IdentityFile /home/botuser/.ssh/id_ed25519\n  StrictHostKeyChecking accept-new" \
    > /home/botuser/.ssh/config && chmod 600 /home/botuser/.ssh/config

# Pre-add known host keys so first connection doesn't warn
RUN ssh-keyscan -t ed25519,rsa,ecdsa github.com >> /home/botuser/.ssh/known_hosts 2>/dev/null \
    && ssh-keyscan -t ed25519,rsa,ecdsa gitlab.cee.redhat.com >> /home/botuser/.ssh/known_hosts 2>/dev/null; \
    chmod 600 /home/botuser/.ssh/known_hosts

# Git config (repo-local style but set as user defaults inside the container)
RUN git config --global user.name "platex-rehor-bot" \
    && git config --global user.email "platform-experience-services@redhat.com" \
    && git config --global gpg.format openpgp \
    && git config --global commit.gpgsign true

CMD ["bash"]
