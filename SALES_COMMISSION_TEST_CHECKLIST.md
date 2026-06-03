# Sales Commission Test Checklist

## Sales Executive Tests

- Log in as admin and open the Sales module.
- Create a sales executive with full name, phone, joined date, work type, and commission rules.
- Confirm full name and phone are required.
- Confirm invalid email values are rejected.
- Confirm duplicate phone or duplicate email is rejected when another active sales executive already uses it.
- Edit address, NIC, work type, payment method, bank details, notes, and commission rules.
- Change status to Active, Inactive, and Suspended.
- Archive a sales executive and confirm the record is removed from active lists.
- Confirm bank details are only available in admin sales executive views.

## Lead Tests

- Create a lead assigned to a sales executive.
- Confirm phone is required.
- Confirm either business name or contact person is required.
- Edit business name, contact person, service, source, status, priority, budget, follow-up date, and notes.
- Filter leads by sales executive, status, interested service, priority, and search text.
- Update lead status through the edit drawer.
- Confirm rejected leads can store a rejection reason.

## Convert Lead Tests

- Convert a lead without client/project links and confirm status becomes Converted.
- Convert a lead with a valid active client link.
- Convert a lead with a valid project link belonging to the selected client.
- Attempt conversion with an invalid client ID and confirm a clear 400 error.
- Attempt conversion with a project that does not belong to the selected client and confirm conversion is blocked.

## Commission Tests

- Create a commission linked to a sales executive.
- Link a commission to a lead, client, project, or invoice.
- Confirm negative commission amounts are rejected.
- Edit commission type, month, year, amount, payment reference, status, and notes.
- Approve a pending commission.
- Mark an approved or pending commission as paid.
- Confirm cancelled commissions cannot be marked as paid.
- Cancel a pending or approved commission.
- Confirm paid commissions cannot be cancelled.

## Monthly Summary Tests

- Open a sales executive summary from the Sales Executives table.
- Confirm total leads, converted leads, active projects, pending commission, paid commission, and target progress display.
- Confirm Sales summary cards show active executives, new leads, follow-up leads, converted leads, pending commission, and paid commission this month.
- Confirm commission filters by sales executive, status, month, and year update the commission table.

## Security Tests

- Confirm all sales executive, lead, commission, and sales summary routes require an admin token.
- Confirm client tokens cannot access `/api/admin/sales-executives`, `/api/admin/leads`, or `/api/admin/commissions`.
- Confirm invalid ObjectIds return clear 400 errors.
- Confirm missing records return clear 404 errors.
- Confirm archived sales executives and archived leads are hidden from active lists.

## Mobile UI Tests

- Open `public/admin.html` on a mobile viewport.
- Confirm the Sales sidebar item is reachable.
- Confirm Sales Executives, Leads, and Commissions tables scroll without layout breakage.
- Confirm all three create/edit drawers fit on mobile.
- Confirm action buttons remain tappable on mobile.
