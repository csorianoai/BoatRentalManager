---
name: DB Schema Notes
description: Non-obvious column names, types, and constraints in Nadaki DB.
---

## boats table
- Column is `name` NOT `boat_name`
- Use: `b.name as boat_name` in queries joining boats

## bookings.booking_date
- Type: TEXT 'YYYY-MM-DD'
- Use: `LEFT(booking_date,7)` for month grouping, NOT TO_CHAR()

## bookings — required NOT NULL columns for INSERT
- platform, customer_name, customer_phone, boat_type, booking_date, total_amount, status
- Always supply all six when inserting QA/test rows

## journal_entry_lines
- Has NO `entry_type` column
- Columns: id, journal_entry_id, line_number, account_code, debit_amount, credit_amount, description, booking_id, boat_id, department, class, created_at

## bookings_ledger
- Has NO `booking_id` FK to bookings — use transactions.booking_id instead

## booking_captain_payments
- Has NO `status` column — uses `voided BOOLEAN` instead
- Void columns: voided, voided_at, voided_reason (added via startup ALTER TABLE)
- Also has source_system TEXT (added via startup ALTER TABLE)

## boat_expenses
- boat_id is NOT NULL (references boats.id ON DELETE CASCADE)
- category has CHECK constraint: ONLY allows 'fuel','maintenance_parts','labor','cleaning','marina_fees','insurance','emergency_repairs','operational'
- 'ice' is NOT an allowed category; use 'operational' for misc small expenses

## transactions.source_system
- CHECK constraint allows ONLY: 'legacy','booking_wizard','webhook','manual_entry','system','corporate','qa_test'
- 'qa_void_test' is NOT allowed — use 'qa_test' for all QA test transaction inserts

## Chart of Accounts
- Revenue: 4010 (Tours), 4020 (Rentals)
- Asset: 1010 (Cash Op), 1015 (Cash Clearing), 1100 (AR)
- Liability: 2010 (Captain Payable), 2020 (Broker Payable)
- Expense: 5000, 5010 (Captain Labor), 5020 (Fuel), 5030 (Ice/Supplies), 5040 (Cleaning), 5050 (Dock/Marina)
