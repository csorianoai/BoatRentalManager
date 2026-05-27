---
name: accounting-period-config keys
description: Exact key names in accounting_period_config table (case-sensitive)
---

## Keys (exact case)

- `ACCOUNTING_CUTOVER_DATE` = 2026-04-27  (was incorrectly queried as `legacy_cutover_date`)
- `CURRENT_PERIOD_STATUS` = active
- `INCLUDE_LEGACY_DEFAULT` = false
- `LEGACY_PERIOD_STATUS` = locked

**Why:** The health check for `legacy_lock` was failing because the key is `ACCOUNTING_CUTOVER_DATE` not `legacy_cutover_date`.
