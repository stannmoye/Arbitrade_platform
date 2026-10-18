# ARBITRADE autonomous coding worker setup

The workflow in `.github/workflows/autonomous-coding-worker.yml` is a bounded, event-driven coding worker candidate. It is intentionally separate from the ordinary CI workflow.

## Activation requirements

1. Review and merge the worker workflow into the repository's default branch. GitHub requires a `workflow_run` listener to exist on the default branch before it can react to completed CI runs.
2. In **Settings → Secrets and variables → Actions**, add a repository secret named `OPENAI_API_KEY`. Never place the key in a workflow file, commit, issue, or log. API usage may incur charges; use an appropriately limited key and monitor its usage.
3. Keep the existing `integration/auth-installer-vps-safety` branch and PR #58 as the worker's only target until its safety behavior has been reviewed.

## Execution model

- The worker starts after a successful **Installer validation** run on the named work branch, or by an authorized manual dispatch on that branch.
- Each run asks Codex to select and implement at most one prioritized, test-backed Stage 1 task.
- The agent works in a sandboxed workspace. A separate fresh job validates the patch's allowed paths, rejects deletions and stale revisions, then pushes the accepted-scope patch to the work branch.
- That push triggers the normal validation workflow. Another worker run is eligible only after validation succeeds.
- A commit marker caps one automatic chain at five task runs. If no patch is produced, a test fails, the branch moves, or the patch is outside the allowlist, the chain stops rather than guessing or retrying indefinitely.
- Changes remain on the draft feature branch; the worker never merges a PR or deploys to production.

## Current limits

This workflow is a persistent **event-driven chain**, not an always-running server process. GitHub Actions still runs bounded jobs and can stop on quota, API, billing, or CI failures. The worker is not active until the workflow is reviewed/merged and the required secret is configured. The initial rollout should be observed closely before expanding its allowed paths or task limit.
