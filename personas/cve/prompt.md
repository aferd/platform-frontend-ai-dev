## CVE Remediation Guidelines

You are fixing a security vulnerability (CVE) in a project.

### Check if already fixed

Before attempting any fix, check if the CVE has already been resolved:
- Run `npm audit` or check the current version of the vulnerable package against the fixed version mentioned in the ticket.
- If the vulnerable package is already at or above the fixed version, the CVE is already resolved.
- In that case: comment on the Jira ticket confirming the CVE is already fixed (include the current version), then transition the ticket to "Done" and stop.

### Determine the CVE source

If the CVE is still present, identify whether the vulnerable dependency is:

1. **An npm package** — listed in `package.json` or `package-lock.json`
2. **A system/base image dependency** — comes from the container base image, not npm

### npm CVEs

If the vulnerable package is an npm dependency:
- Check if it's a direct or transitive dependency (`npm ls <package-name>`).
- For direct dependencies: bump the version in `package.json` to a patched version.
- For transitive dependencies: check if upgrading a direct parent dependency pulls in the fix. If not, add an `overrides` entry in `package.json`.
- Run `npm install` to regenerate the lock file.
- Run tests to ensure nothing breaks.
- Commit both `package.json` and `package-lock.json`.

### Non-npm CVEs (base image) — frontend repos only

This applies only to **frontend** repositories. If the vulnerability is NOT in an npm package, it comes from the container base image. Frontend apps inherit their base image from `build-tools`, so the CVE cannot be fixed in the application repo.

In this case:
- Do NOT attempt to fix it in the application repo.
- Comment on the Jira ticket explaining that this is a base image CVE from `build-tools` and needs to be addressed there.
- If `build-tools` is in `project-repos.json`, check if the base image has already been updated.

For **backend** repos, non-npm CVEs should be investigated and fixed normally — backends manage their own base images.

### Verification — npm CVEs
- After fixing an npm CVE, run `npm audit` to confirm the vulnerability is resolved.
- Run the full test suite to ensure the upgrade doesn't break anything.
- Use the LSP tool to check for type errors if the upgraded package has API changes.

### Verification — container image scanning (frontend repos)

Frontend repos have a `Dockerfile` (sometimes also `Dockerfile.hermetic`) that builds the production container image. After any CVE fix — whether npm or base image — verify the built image is clean:

1. **Build the image**:
   ```bash
   docker build . -t <repo-name>:audit
   ```
   If the repo has multiple Dockerfiles, build the non-hermetic one (plain `Dockerfile`) since that's closest to what CI builds.

2. **Scan with grype**:
   ```bash
   grype <repo-name>:audit --fail-on medium --only-fixed
   ```
   `--fail-on medium` exits non-zero if any medium+ severity vulnerabilities with known fixes remain. `--only-fixed` filters to only show CVEs that have a fix available. Check that the specific CVE from the ticket no longer appears and that the scan passes.

3. **Clean up**:
   ```bash
   docker rmi <repo-name>:audit
   ```

4. **Report results**: Include the grype scan output (or a summary) in the PR description and the Jira comment so reviewers can verify the fix.

If `grype` is not installed, skip the scan and note in the PR description that manual verification with a container scanner is needed.
