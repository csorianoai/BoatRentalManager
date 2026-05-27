---
name: ERP Audit Endpoints
description: Key DB quirks and schema facts needed for the 8 audit/QA endpoints in FASE 1-10
---

## Critical Schema Facts

- `booking_date` in `bookings` table is TEXT ('YYYY-MM-DD') — use `LEFT(booking_date, 7)` not `TO_CHAR()`
- `bookings_ledger` has its own `id` (bl_xxx), NO `booking_id` FK to bookings — use `transactions.booking_id` instead
- `bookings_ledger.revenue_recognized` is BOOLEAN, not numeric — use `CASE WHEN revenue_recognized THEN total_amount ELSE 0 END`
- `journal_entries` has `excluded_from_reports` column (NOT `excluded_from_ledger`)
- `journal_entry_lines` has NO `entry_type` column
- `financial_periods` table exists but 0 rows — period management via `accounting_period_config`
- `booking_captain_payables` has 11 duplicate booking+captain combos (pre-existing, WARN not FAIL)
- `accounting_reversal_log` has 46 entries with NULL reversal_tx_ids (legacy data, WARN not FAIL)
- `transactions` duplicate reference+type combos (7 combos, WARN not FAIL)
- `transactions` key columns: `booking_id`, `ledger_id`, `excluded_from_ledger`, `is_reversal`, `amount`, `transaction_type` ('income'|'expense')

## Revenue/AR Mismatch Policy

Revenue/AR mismatches between bookings and GL are expected (journals partially posted) — classified as `warning` not `fail`. Only trial balance imbalance is `fail`.

## All Endpoints (server.js ~line 23833+)

1. `GET /api/accounting/audit/full-system-health` — 12/12 modules
2. `GET /api/accounting/audit/forensic-ledger-rebuild?period=YYYY-MM`
3. `GET /api/accounting/audit/booking-reconstruction-test?limit=N&period=YYYY-MM`
4. `POST /api/accounting/qa/double-reversal-safety-test`
5. `POST /api/accounting/qa/month-close-test`
6. `POST /api/accounting/qa/concurrency-test`
7. `GET /api/accounting/audit/ui-ledger-crosscheck?period=YYYY-MM`
8. `GET /api/accounting/onboarding/qa-status`
9. `POST /api/accounting/qa/final-enterprise-audit`
