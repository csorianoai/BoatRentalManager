---
name: ERP Hardening V2
description: Lessons from implementing FASES 1-11 revenue recognition, snapshots, CFO dashboard, reconciliation, audit trail.
---

## runStep Bug
The `final-enterprise-audit` endpoint's `runStep` function had `return { ok, data }` shorthand.
When `ok` was renamed to `isPass`, the shorthand caused ReferenceError in Node.js because
`ok` was used as both a property key AND a variable name in shorthand notation.
**Fix**: use `Object.assign` instead of spread in forEach, return `{ stepPassed: isPass, stepData: data }`.

**Why**: JavaScript shorthand `{ ok }` means "property named ok with value of variable ok". If `ok` is not defined as a variable, it throws ReferenceError even when used as a property key in shorthand. Use explicit `{ key: value }` notation to avoid this.

## Status Classification
- runStep treats 'pass', 'ok', 'dry_run' as PASS
- 'warning' as WARN
- anything else as FAIL

## Expected Warnings (Not Bugs)
3 audit warnings are data gaps: 4 bookings not posted to GL.
Fix: POST /api/accounting/revenue-recognition/run

## New Tables
revenue_recognition_queue, daily_financial_snapshots, bank_imports, bank_reconciliation_matches
