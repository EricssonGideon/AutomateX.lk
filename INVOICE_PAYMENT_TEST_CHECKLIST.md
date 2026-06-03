# Invoice PDF, Email, and Payment Tracking Checklist

## Admin Invoice Management

- Create a Project invoice linked to a client and project.
- Create a Maintenance invoice linked to a maintenance plan.
- Create an Upgrade or Custom invoice with no project link.
- Confirm invoice list filters work for search, status, invoice type, month, due-from, and due-to.
- Confirm invoice table shows invoice number, client/business, reference, total, paid, balance, payment status, email status, due date, and actions.
- Open an invoice and confirm reference links, payment method, payment notes, client notes, and admin notes are visible.
- Edit invoice totals, dates, type, links, payment method, client notes, and payment notes.

## PDF

- Download an invoice PDF from admin.
- Download the same invoice PDF from the client portal.
- Confirm the PDF contains AutomateX branding, invoice number, client details, issue date, due date, line items, subtotal, discount, tax, total, paid amount, balance, notes, and payment instructions.
- Confirm cancelled, partial, paid, and overdue invoices still generate PDFs.

## Email

- Send an invoice email from the admin invoice list.
- Send an invoice email from the invoice drawer.
- Confirm `emailStatus` changes to `Sent` when Resend is configured.
- Confirm `emailStatus` changes to `Failed` with a clear message when email delivery is not configured.
- Confirm the email contains invoice number, total, paid, balance, due date, payment instructions, and the client portal link.

## Payments

- Record a partial payment with payment method and payment notes.
- Confirm paid amount increases and balance decreases.
- Record the remaining payment and confirm status becomes `Paid`.
- Mark an invoice fully paid and confirm paid amount equals total and balance is zero.
- Cancel an unpaid invoice and confirm status/payment status becomes cancelled.
- Confirm commission payment approval remains manual and is not automatically triggered by invoice payment changes.

## Client Portal

- Log in as the invoice client.
- Confirm invoices list shows invoice type, reference, total, paid, balance, payment status, due date, and PDF download.
- Confirm admin-only notes are not visible to the client.
- Confirm another client cannot download an invoice PDF that does not belong to them.
