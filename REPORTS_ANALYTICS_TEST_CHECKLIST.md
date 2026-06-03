# AutomateX Reports Analytics Test Checklist

## Overview Report Tests
- Verify `GET /api/admin/reports/overview` returns current-month data by default.
- Verify KPI fields exist for clients, projects, invoices, revenue, commissions, maintenance, leads, and support.
- Verify table payloads do not include password hashes, reset tokens, bank details, or private admin notes.

## Revenue Report Tests
- Verify `GET /api/admin/reports/revenue` returns total invoiced, total paid, total pending, overdue balance, monthly series, and invoice-type totals.
- Verify `month=YYYY-MM` changes the revenue period.
- Verify `from=YYYY-MM-DD&to=YYYY-MM-DD` changes the revenue period.

## Project Report Tests
- Verify `GET /api/admin/reports/projects` returns total, active, completed, status, type, and deadline-risk data.
- Verify completed-this-period changes with date filters.
- Verify archived projects are excluded.

## Invoice Report Tests
- Verify `GET /api/admin/reports/invoices` returns payment/status summaries.
- Verify overdue invoices include open balances only.
- Verify unpaid and partial invoices appear in the unpaid queue.
- Verify paid-this-period respects `paidDate`.

## Sales Report Tests
- Verify `GET /api/admin/reports/sales` returns leads by status, conversion rate, leads by executive, and commission totals.
- Verify pending/approved commissions appear in the pending commission table.
- Verify paid commission amount respects `paidDate`.

## Maintenance Report Tests
- Verify `GET /api/admin/reports/maintenance` returns active, expiring soon, expired, expected renewal amount, and payment status summary.
- Verify expiring soon includes plans due within 30 days.
- Verify private maintenance admin notes are not returned.

## Support Report Tests
- Verify `GET /api/admin/reports/support` returns open, resolved, type, and status summaries.
- Verify open support table includes only open or in-progress requests.
- Verify private admin notes are not returned.

## Role Access Tests
- Verify Admin can access all report endpoints and exports.
- Verify Manager can access report endpoints and exports.
- Verify Staff access follows current admin-route access behavior.
- Verify Client receives 403 for all `/api/admin/reports/*` endpoints.

## Date Range Tests
- Verify invalid date ranges return 400.
- Verify `from` after `to` returns 400.
- Verify current-month quick filter updates UI analytics.
- Verify custom date range overrides month filter.

## Mobile UI Tests
- Verify Reports filters stack cleanly on mobile.
- Verify KPI cards remain readable on mobile.
- Verify report tables scroll horizontally without breaking layout.

## CSV Export Tests
- Verify revenue CSV downloads.
- Verify project risk CSV downloads.
- Verify invoice CSV still downloads.
- Verify sales/commission CSV downloads.
- Verify maintenance renewal CSV downloads.
- Verify support request CSV still downloads.
- Verify CSV exports do not include password hashes, reset tokens, bank details, or private admin notes in the new report exports.
