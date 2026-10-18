# ARBITRADE development workflow: ChatGPT authors, GitHub validates

**Status:** proposed; pending review and merge. The process below is the intended operating model while the separate OpenAI API-key quota is unavailable.

## Responsibilities

- **Development and review:** Use ChatGPT with the connected GitHub repository tools to inspect the current branch, make bounded source/test/documentation changes, review the diff, and create a reviewable branch or pull request. This work happens during an active ChatGPT session; it is not an always-on daemon.
- **Automated verification:** GitHub Actions runs the repository's existing type checks, application tests, installer/migration tests, build checks, and disposable-database checks on the events configured by the workflows. Treat each run as evidence only for the exact commit it tested.
- **Progress tracking:** Keep the Stage 1 task queue and progress report aligned with actual changes and CI evidence. Parallelize independent read-only investigations and disjoint test work; coordinate changes to shared files.
- **Release safety:** Keep application changes reviewable. Do not merge the Stage 1 integration candidate or deploy to production merely because CI is green. Do not access production databases/VPS systems or perform live financial mutations.

## API-key worker

The legacy `.github/workflows/autonomous-coding-worker.yml` uses `OPENAI_API_KEY` and therefore has a separate API quota. It is configured as **manual-only** so successful CI runs do not repeatedly invoke a worker that cannot run while API quota is exhausted. Do not dispatch it unless the API project has available quota and a deliberate API-worker run is wanted. Ordinary CI does not require that key.

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

ChatGPT access through a connected tool is not an unlimited background coding service. This workflow removes the separate API key from the normal development loop, but a person still needs to start/continue ChatGPT work and the ChatGPT plan/tool allowances may apply. GitHub Actions can test changes automatically; it does not author application code on its own.
