# Permissions and API Test Checklist

## Automated Coverage

- Run `npm run test:api` to verify the central permission map and auth middleware behavior.
- Run `npm test` to execute the full Node built-in test suite.
- Confirm unauthenticated API access returns `401`.
- Confirm client users are blocked from admin middleware with `403`.
- Confirm Admin can access `users:manage`, `audit:view`, and `settings:manage`.
- Confirm Manager can access reports and exports but not users, settings, or audit logs.
- Confirm Staff can view operational data, update project status/progress, and manage support notes/status.
- Confirm Staff cannot export reports, manage users, view audit logs, send invoices, mark invoices paid, or approve/pay/cancel commissions.

## Manual API Smoke Tests

- `GET /api/health` should return healthy service metadata.
- `GET /api/admin/reports/overview` without a token should return `401`.
- `GET /api/admin/reports/overview` as Client should return `403`.
- `GET /api/admin/reports/overview` as Manager should return `200`.
- `GET /api/admin/users` as Manager or Staff should return `403`.
- `GET /api/admin/users` as Admin should return `200`.
- `GET /api/admin/audit-logs` as Manager or Staff should return `403`.
- `GET /api/admin/audit-logs` as Admin should return `200`.
- `GET /api/admin/reports/export/revenue` as Staff should return `403`.
- `PATCH /api/admin/projects/:id/status` as Staff should update only status/progress.
- `PATCH /api/admin/projects/:id` as Staff should return `403`.
- `PATCH /api/admin/requests/:id` as Staff should allow support status/notes updates.
- `PATCH /api/admin/invoices/:id/mark-paid` as Staff should return `403`.
- `POST /api/admin/invoices/:id/send-email` as Staff should return `403`.
- `PATCH /api/admin/commissions/:id/approve` as Staff should return `403`.
- `PATCH /api/admin/commissions/:id/mark-paid` as Staff should return `403`.
- `PATCH /api/admin/commissions/:id/cancel` as Staff should return `403`.

## Admin UI Checks

- Admin should see Users & Roles, Settings, Audit Logs, report export buttons, and all business management actions.
- Manager should not see Users & Roles, Settings, or Audit Logs, but should see report export and business management actions.
- Staff should not see Users & Roles, Settings, Audit Logs, report export buttons, create buttons, invoice payment/email/cancel buttons, commission approve/paid/cancel buttons, or archive/delete controls.
- Staff should still see operational read-only tables and should be able to open projects for status/progress updates.

## Password Reset Checks

- Forgot-password request should return a generic success message for known and unknown emails.
- Reset-token verification should reject invalid or expired tokens.
- Password reset should accept a valid token and allow login with the new password.
- Old password should no longer work after reset.

## Regression Checks

- Run `npm run lint`.
- Run `node -e "require('./server/server')"`.
- Login as Admin, Manager, and Staff in `public/admin.html` and confirm role-specific navigation and controls.
