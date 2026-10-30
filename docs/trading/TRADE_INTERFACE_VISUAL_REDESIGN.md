# Trade interface visual redesign

**Scope:** Customer and administrator Trade pages, Trade navigation groups, Trade submenus, package policy cards, opportunity records, forms, buttons, data tables, and the persistent customer opportunity display.

## Design direction

- Use the active portal theme's semantic colour tokens so all six installed themes remain supported.
- Give Trade areas a consistent premium visual language: layered surfaces, restrained accent gradients, refined borders, rounded containers, clearer hierarchy, and compact operational metadata.
- Improve button hierarchy and hover, focus, active, and disabled states without changing the action behind any control.
- Improve customer opportunity cards, eligibility progress, company references, trade history, and the persistent opportunity display.
- Improve administrator Trade navigation groups and the package, delivery, timing, fee, retry, health, and settlement screens.
- Preserve responsive layouts, keyboard focus visibility, forced-colour support, and reduced-motion preferences.

## Behaviour boundary

This is a presentation-only change. It does not alter Trading routes, navigation destinations, package settings, qualification, quotas, scheduling, wallet balances, FX conversion, allocations, returns, fees, retries, settlement, worker processing, or audit behaviour.

## Validation

The stylesheet contract tests assert that the Trade-only scope is applied and that customer/admin surfaces and accessibility states are covered. Full repository checks are recorded in the pull request after exact-head CI completes.
