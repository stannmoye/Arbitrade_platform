# ARBITRADE development workflow: ChatGPT authors, GitHub validates

**Status:** proposed; pending review and merge. This describes the operating model while the separate OpenAI API-key quota is unavailable.

## Responsibilities

- **Development and review:** Use ChatGPT with the connected GitHub repository tools to inspect the current branch, make bounded source/test/documentation changes, review the diff, and create a reviewable branch or pull request. This work happens during an active ChatGPT session; it is not an always-on daemon.
- **Automated verification:** GitHub Actions runs the repository's existing type checks, application tests, installer/migration tests, build checks, and disposable-database checks on the events configured by the workflows. Treat each run as evidence only for the exact commit it tested.
- **Progress tracking:** The proposed autonomy progress workflow writes the task queue, readiness matrix, commit, and run link into a GitHub Actions job summary. It is a reporting layer, not a coding agent.
- **Release safety:** Keep application changes reviewable. Do not merge the Stage 1 integration candidate or deploy to production merely because CI is green. Do not access production databases/VPS systems or perform live financial mutations.

## API-key worker

The legacy worker on `main` is manual-only because `OPENAI_API_KEY` has a separate API quota, and the prior attempt failed with quota exceeded. PR #65 proposes an optional `workflow_run` trigger guarded by repository variable `ARBITRADE_AUTONOMOUS_WORKER_ENABLED == 'true'`. The variable must remain disabled until the API quota is restored and one supervised manual run has been reviewed. This avoids repeatedly invoking a worker that cannot currently produce code. Ordinary CI does not require the API key.

## Standard development loop

1. Read the queue, progress report, current branch head, and open pull requests.
2. Choose one highest-priority, safely testable task; inspect relevant implementation and tests.
3. Implement a focused change and regression test on a reviewable branch.
4. Run available focused checks when the execution environment permits; do not claim tests were run if they were not.
5. Open/update a pull request and allow GitHub Actions to validate it.
6. Inspect all required results against the exact PR head; address failures with another small change.
7. Update the queue/progress report with commit, run links, test outcomes, remaining gaps, and the next task.
8. Preserve the production safety gates and human review.

## Important limitation

ChatGPT access through a connected tool is not an unlimited background coding service. It can help develop code during an active session, while the optional GitHub Actions worker can provide bounded unattended coding only after its separate API credential/quota and activation gates are satisfied. GitHub Actions alone does not author application code, and no setup can safely promise that all future tasks will succeed without human intervention when requirements are ambiguous or a blocker appears.
