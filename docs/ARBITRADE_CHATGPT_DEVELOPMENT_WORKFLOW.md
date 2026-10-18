# ARBITRADE development workflow: ChatGPT authors, GitHub validates

**Agreed method:** Option B — use ChatGPT with the connected GitHub tools for development, and GitHub Actions for automated validation. Routine development in this path does not require a separate OpenAI API key or API quota.

## Responsibilities

- **Development and review:** During an active ChatGPT session, inspect the repository, make bounded source/test/documentation changes, review diffs, and create or update reviewable changes.
- **Automated verification:** GitHub Actions runs the configured type checks, application tests, installer/migration tests, build checks, and disposable-database checks on their configured events. Each result applies only to the exact commit tested.
- **Failure diagnosis:** Inspect failed workflow logs, identify the likely cause, make a focused correction during active ChatGPT work, and rerun validation.
- **Progress tracking:** Keep the task queue, readiness matrix, and progress report aligned with actual commits and CI evidence. The dashboard is a reporting layer, not a coding agent.
- **Release safety:** Do not merge the Stage 1 integration candidate or deploy to production merely because CI is green. Do not access production databases/VPS systems or perform live financial mutations.

## Legacy API-key worker

The legacy `.github/workflows/autonomous-coding-worker.yml` uses `OPENAI_API_KEY` and therefore has separate API quota. PR #61 made it manual-only so successful CI runs do not trigger separate billed API calls. Keep it parked unless the owner explicitly chooses to use that separate API-based worker. Ordinary ChatGPT-led development and normal GitHub Actions CI do not need that key.

## Standard development loop

1. Read the queue, progress report, current branch head, and open pull requests.
2. Choose one highest-priority unblocked task; inspect the implementation and tests.
3. Implement a focused code change and regression test on a reviewable branch.
4. Inspect the diff and run available focused checks when possible; never claim unrun tests passed.
5. Open/update a pull request and let GitHub Actions validate the exact commit.
6. Inspect required results; address failures during active ChatGPT work and rerun validation.
7. Update progress records with commit, run links, outcomes, limitations, and the next task.
8. Preserve human review and production safety gates.

## Important limitation

This method removes the separate API key from routine development, but it is not an always-on background coding daemon. ChatGPT can continue development when the session is active; GitHub Actions can test changes automatically but does not independently author application code. Plan/tool usage limits may still apply to ChatGPT itself. If a genuine blocker or ambiguous financial/business rule appears, stop and request a decision rather than guessing.
