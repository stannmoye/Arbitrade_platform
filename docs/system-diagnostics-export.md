# Worker health and full system diagnostic export

## Admin health dashboard

Trade Settings → Worker Health & Recovery presents live worker heartbeats, queue state and a full-system diagnostic assessment. The administrator can refresh worker health, generate a fresh diagnostic snapshot, and compare a post-fix snapshot with the previous saved snapshot.

The dashboard includes:
- **System health overview:** pass, warning, failed and not-run check totals plus a deployment-readiness interpretation.
- **Severity classification:** Critical for failed database/configuration checks, High for other failed checks, Medium for warnings, Low for checks not run, and Informational for passes.
- **Automatic issue detection:** all non-pass diagnostic checks are surfaced with evidence and a recommended correction where available.
- **Feature-by-feature assessment:** Not Working when expected source files are missing, Degraded when a check clearly relates to that feature and is not passing, and Not Verified when runtime acceptance evidence is unavailable. Source presence alone is never described as Working.
- **Post-fix verification:** obtains a fresh server-side snapshot and compares failed/warning totals with the previous saved snapshot. Review individual checks as well as the total; a lower count is not proof that a correction is safe or complete.
- **Historical trend:** retains up to 30 snapshot summaries in local browser storage for the current administrator/browser. This history is not shared across browsers or devices and is not a server-side audit archive.

## Export formats

- **JSON:** complete structured report, including the detailed source inventory, worker/queue data, checks, findings, feature coverage, environment-variable presence, database/schema status, runtime metrics and recommendations.
- **Excel / CSV:** spreadsheet-compatible CSV containing diagnostic checks, severity, evidence, recommendations, feature assessments, worker records, source-file inventory, source review markers, runtime/database metrics (including CPU load and host RAM) and required configuration presence (values redacted). Open it in Excel or another spreadsheet application.
- **Print / PDF:** opens a print-ready report containing findings, feature assessments, runtime/database details, worker detail, source inventory, review markers, recommendations and scope limitations. Use the browser print dialog's **Save as PDF** destination to create a PDF file.

All formats are generated on demand from a fresh report. Secret values are never exported. Operational identifiers and sanitized error summaries may be present; keep exports private and share them only with trusted maintainers.

## Admin export endpoint and report scope

The administrator-only `systemDiagnostics` query creates a fresh, read-only snapshot when requested. The browser downloads the report directly; it does not run compilers, tests or builds in the live request path.

The report includes:
- Monitored worker records, derived health state, expected/stale intervals, heartbeat/success/failure timestamps, duration, failure count and sanitized error detail.
- Trading qualification queue counts and the latest retained dead-letter details.
- Server runtime version, uptime, platform, CPU count and 1/5/15-minute load averages, total/free host memory, process memory and heap pressure.
- Required environment-variable presence only; secret values are never exported.
- Database connectivity and presence of critical worker, Trading, ledger, user and audit tables.
- A bounded inventory of application source files across client, server, shared, migrations, scripts and installer areas, including file sizes and per-area/test counts.
- Potential TODO/FIXME/XXX/HACK/not-implemented markers in implementation files with file and line references. Test fixtures and the scanner's own marker vocabulary are excluded to avoid self-generated false positives. These are review prompts, not confirmed defects.
- Core feature source-presence coverage, worker-registration wiring, admin diagnostic-route wiring, startup-wrapper checks, source-contract findings and actionable recommendations.

## Finding severity and readiness

- **Critical:** failed database connectivity, required runtime configuration or equivalent deployment-blocking prerequisites.
- **High:** other failed source/runtime contract checks.
- **Medium:** warnings such as stale/degraded/not-started workers, dead-lettered work, incomplete scans or review markers.
- **Low:** checks intentionally not run or unavailable; absence of evidence is not a pass.
- **Informational:** checks that passed.

The overall status remains `action_required`, `review_required`, or `no_detected_issues` based on recorded checks. A missing database or unavailable queue is never represented as zero or healthy. “No detected issues” means only that the checks which ran did not detect an issue; it is not production certification.

## Important limits and safety boundaries

The source inventory is bounded to 6,000 files/50 MiB and the marker scan to 20 MiB/512 KiB per file, with at most 250 marker references. Any truncated or incomplete scan is reported as incomplete. It is an inventory and review-marker scan, not a compiler, complete static analyzer, dependency vulnerability scan, or proof that every feature works.

The live export does not run `pnpm check`, `pnpm test`, `pnpm build`, dependency vulnerability scans, or feature-specific authenticated acceptance. These remain CI/release checks and must be run against the exact deployed commit.

Worker history is limited to the monitor's retained 24-hour/500-row read and latest 25 dead-lettered qualification jobs. Browser snapshot history is local to that browser and can be cleared by browser storage policies; it is not an authoritative audit log.

Recommendations and verification are read-only. They do not edit production code, apply database migrations, change financial records, retry jobs, or restart services. Corrective actions must be reviewed and applied through the normal authorized development/deployment process, then verified again. A passing source check or reduced issue count must never be treated as proof of financial correctness or production readiness.
