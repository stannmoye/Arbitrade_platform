# ARBITRADE autonomous coding worker setup

The workflow in `.github/workflows/autonomous-coding-worker.yml` is a bounded, event-driven coding worker. Its automatic trigger is deliberately dormant until an owner enables a repository variable. Keep it separate from ordinary CI validation.

## Activation requirements

1. Review the changes in PR #65 and merge the workflow only after reviewing its permissions, target branch, task cap, patch allowlist, and failure-stop behavior. GitHub requires the `workflow_run` listener to exist on the default branch before it can react to completed CI runs.
2. In **Settings → Secrets and variables → Actions**, configure a secret named `OPENAI_API_KEY`. Never place the key in a workflow file, commit, issue, or log. API usage may incur charges; use an appropriately limited key and monitor usage.
3. Confirm the API project has available quota. The previous worker attempt failed with a quota-exceeded error; the existence of a secret alone does not mean the API can serve requests.
4. Leave the repository variable `ARBITRADE_AUTONOMOUS_WORKER_ENABLED` unset or set to `false` for the supervised test. After that test succeeds, an authorized owner may set it to the string `true` under **Settings → Secrets and variables → Actions → Variables** to enable automatic follow-on runs.
5. Keep `integration/auth-installer-vps-safety` as the worker's only target until the complete chain has been observed and reviewed. Do not point it at `main`.

## Execution model

- An authorized manual dispatch can run on `integration/auth-installer-vps-safety` while the automatic-worker variable is disabled, allowing a supervised first run.
- When the variable is exactly `true`, the worker can start after a successful **push-triggered Installer validation** run on the named work branch.
- Each run asks Codex to select and implement at most one prioritized, test-backed Stage 1 task.
- The agent works in a sandboxed workspace. A separate fresh job validates the patch's allowed paths, rejects deletions and stale revisions, then pushes the accepted-scope patch to the work branch.
- That push starts the existing Installer validation workflow. Another task becomes eligible only after that validation succeeds.
- Consecutive automatic commit markers cap a chain at five tasks. A normal human-authored commit starts a new chain. If no patch is produced, validation fails, the branch moves, or the patch is outside the allowlist, the chain stops.
- The progress dashboard writes an evidence summary to GitHub Actions job summaries. It reports progress; it does not author code or certify production readiness.
- Changes remain on the feature branch; the worker never merges a PR or deploys to production.

## Current limits

This is a persistent **event-driven chain**, not an always-running server process. GitHub Actions runs bounded jobs and can stop on quota, API, billing, runner, or CI failures. The worker is not active until the workflow is merged, the API credential/quota work, and the owner deliberately enables the repository variable. Do not paste API credentials into ChatGPT. The initial rollout should be observed closely before expanding its allowed paths or task limit.
