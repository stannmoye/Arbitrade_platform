# Worker health and full system diagnostic export

## Admin export

Trade Settings → Worker Health & Recovery includes **Export full report**. The administrator-only `systemDiagnostics` query creates a fresh, read-only JSON snapshot when the button is clicked. The browser downloads the report directly; it does not require a report-storage table or background job.

The report includes:
- Monitored worker records, derived health state, expected/stale intervals, heartbeat/success/failure timestamps, duration, failure count and sanitized error detail.
- Trading qualification queue counts and the latest retained dead-letter details.
- Server runtime version, uptime, platform, CPU count, process memory and heap pressure.
- Required environment-variable presence only; secret values are never exported.
- Database connectivity and presence of critical worker, Trading, ledger, user and audit tables.
- A bounded inventory of application source files across client, server, shared, migrations, scripts and installer areas, including file sizes and per-area/test counts.
- Potential TODO/FIXME/XXX/HACK/not-implemented markers with file and line references. These are review prompts, not confirmed defects.
- Core feature source-presence coverage, worker-registration wiring, admin diagnostic-route wiring, startup-wrapper checks, source-contract findings and actionable recommendations.

## Finding severity

- **fail**: a required runtime, database, schema, or source contract check failed.
- **warning**: stale/not-started/degraded worker state, dead-lettered work, missing source files, source review markers, or an operational concern needs review.
- **not_run**: a check could not be performed or is intentionally not executed by an export request.
- **pass**: the specific check completed successfully. This is not a certification of the entire application.

The overall status is `action_required`, `review_required`, or `no_detected_issues` based on the recorded checks. A missing database or unavailable queue is never represented as zero or healthy.

## Important limits

The source inventory is bounded to 6,000 files/50 MiB and the marker scan to 20 MiB/512 KiB per file, with at most 250 marker references. Any truncated or incomplete scan is reported as incomplete. It is an inventory and review-marker scan, not a compiler, complete static analyzer, or proof that every feature works.

The export does not run `pnpm check`, `pnpm test`, `pnpm build`, dependency vulnerability scans, or feature-specific authenticated acceptance. Executing those operations inside a live HTTP request would be unsafe and could consume server resources or disrupt service. They remain CI/release checks and must be run against the exact deployed commit.

Worker history is limited to the monitor's retained 24-hour/500-row read and latest 25 dead-lettered qualification jobs. The report is a point-in-time snapshot, not a permanent archive. It contains operational identifiers and error summaries, so keep the downloaded file private and share it only with trusted maintainers. No credentials or secret values should appear in the report.
