---
name: DB Schema Notes
description: Non-obvious column names and types in Nadaki DB.
---

## boats table
- Column is `name` NOT `boat_name`
- Use: `b.name as boat_name` in queries joining boats

## bookings.booking_date
- Type: TEXT 'YYYY-MM-DD'
- Use: `LEFT(booking_date,7)` for month grouping, NOT TO_CHAR()

## journal_entry_lines
- Has NO `entry_type` column
- Columns: id, journal_entry_id, line_number, account_code, debit_amount, credit_amount, description, booking_id, boat_id, department, class, created_at

## bookings_ledger
- Has NO `booking_id` FK to bookings — use transactions.booking_id instead

## Chart of Accounts
- Revenue: 4010 (Tours), 4020 (Rentals)
- Asset: 1010 (Cash Op), 1015 (Cash Clearing), 1100 (AR)
- Liability: 2010 (Captain Payable), 2020 (Broker Payable)
- Expense: 5000, 5010 (Captain Labor), 5020 (Fuel), 5030 (Ice/Supplies), 5040 (Cleaning), 5050 (Dock/Marina)
