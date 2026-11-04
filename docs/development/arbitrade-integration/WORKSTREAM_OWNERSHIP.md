# Workstream Ownership

**Updated:** 2026-11-04

| Workstream | Confirmed responsibility | Integration boundary |
|---|---|---|
| Window 1 | Company catalogue, eligibility and automatic company rotation | Supplies `server/modules/company-spotlight-rotation.ts` contract; does not own opportunity-generation engine |
| Window 3 | Automatic opportunity-generation engine (per current task assignment) | Consumes Window 1 selection contract; does not duplicate catalogue/rotation |
| Window 7 | Final integration, reconciliation and verification | Integrates approved workstream branches; owns final merge decision |
| Windows 2, 4, 5, 6 | Exact assignment to be confirmed from their active workstream prompts/branches | Do not infer ownership from branch names alone |

Existing PRs and branches are implementation evidence, not authoritative proof of a chat window's ownership. Update this table when each window provides its explicit assignment.
