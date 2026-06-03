# AutomateX Staging Final QA Checklist

Use this checklist for staging deployment sign-off before production cutover.

## A. Environment Setup

- [ ] `MONGODB_URI` points to the staging or production-like MongoDB cluster.
- [ ] `JWT_SECRET` is set to a long random staging secret.
- [ ] `PUBLIC_APP_URL` points to the staging HTTPS origin.
- [ ] `CLIENT_DASHBOARD_URL` points to the staging client dashboard URL.
- [ ] `PASSWORD_RESET_URL` points to the staging password reset URL.
- [ ] `ALLOWED_ORIGINS` contains only exact approved staging origins.
- [ ] Resend/email env is configured: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SUPPORT_EMAIL`.
- [ ] Stripe env is configured if payments are enabled: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, package price IDs.
- [ ] `STORAGE_DRIVER=s3`.
- [ ] Local filesystem storage is used only for development, not staging or production.
- [ ] R2/S3 env variables are set: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`.
- [ ] `S3_PUBLIC_BASE_URL` is empty unless public bucket/custom-domain delivery is intentionally approved.
- [ ] HTTPS is active on the staging domain.
- [ ] DNS points the staging domain to the current deployment target.

## B. Public Website Checks

- [ ] Homepage loads: `/`.
- [ ] Pricing page loads: `/pricing.html`.
- [ ] Services links work.
- [ ] Contact form works.
- [ ] Primary CTA buttons work.
- [ ] Favicon and logo are visible.
- [ ] Public pages work in mobile view.
- [ ] Browser console has no errors.

## C. Auth Checks

- [ ] Admin login works.
- [ ] Client login works.
- [ ] Logout clears the correct session.
- [ ] Forgot password request works.
- [ ] Reset password with valid token works.
- [ ] Invalid or expired reset token is handled safely.
- [ ] Invalid auth token handling redirects or blocks access correctly.
- [ ] CSRF-protected admin requests work.
- [ ] CSRF-protected client requests work.
- [ ] Unsafe requests without valid CSRF token are rejected.

## D. Admin Portal Checks

- [ ] Admin dashboard KPIs load.
- [ ] Clients list and client drawer work.
- [ ] Projects list and project drawer work.
- [ ] Project files upload works.
- [ ] Project files download works.
- [ ] Maintenance records load and update.
- [ ] Invoices load.
- [ ] Invoice PDF download works.
- [ ] Invoice email send works.
- [ ] Invoice payment update works for permitted roles.
- [ ] Sales executives load and update.
- [ ] Leads load and update.
- [ ] Commissions load and permitted actions work.
- [ ] Reports load.
- [ ] Report exports work for permitted roles.
- [ ] Users and roles load for permitted roles.
- [ ] Audit logs load for permitted roles.
- [ ] Settings load and save for permitted roles.
- [ ] Support requests load and update.
- [ ] Bookings load and update.
- [ ] Inquiries load and update.
- [ ] Reviews load and moderate correctly.

## E. Client Portal Checks

- [ ] Client dashboard loads.
- [ ] Own projects are visible.
- [ ] Other client projects are blocked.
- [ ] `Client Visible` files are visible.
- [ ] `Admin Only` files are hidden.
- [ ] Own invoices are visible.
- [ ] Invoice PDF download works.
- [ ] Maintenance status is visible.
- [ ] Support request creation works.
- [ ] Profile/settings load.
- [ ] Profile/settings save works where enabled.

## F. R2 Storage Checks

- [ ] Storage config check passes.
- [ ] Live storage connectivity check passes from staging shell.
- [ ] Admin can upload an allowed file.
- [ ] Dangerous file extension is blocked.
- [ ] MIME mismatch is blocked.
- [ ] Admin download works.
- [ ] Client visible download works.
- [ ] Client is blocked from `Admin Only` file.
- [ ] Cross-client file access is blocked.
- [ ] Audit log records admin file download.

## G. Role/Permission Checks

- [ ] Admin has full access.
- [ ] Manager has intended business access.
- [ ] Manager cannot access users/settings if blocked.
- [ ] Staff has limited access.
- [ ] Client is blocked from admin APIs.
- [ ] Staff is blocked from commission approve/pay/cancel.
- [ ] Staff is blocked from invoice payment update if configured.
- [ ] UI hiding matches API authorization.

## H. Security Header Checks

- [ ] CSP header has `script-src 'self'`.
- [ ] CSP header has `style-src 'self'`.
- [ ] CSP header has `font-src 'self'`.
- [ ] CSP header has no `unsafe-inline`.
- [ ] CSP header has no Tailwind CDN.
- [ ] HTML has no Tailwind CDN.
- [ ] HTML has no Google Fonts.
- [ ] CSP header has `object-src 'none'`.
- [ ] HTTPS is active.
- [ ] CORS allows only exact approved origin.
- [ ] Browser console shows no CSP violations.

## I. Reports/Export Checks

- [ ] Overview report loads.
- [ ] Revenue report loads.
- [ ] Project report loads.
- [ ] Invoice report loads.
- [ ] Sales report loads.
- [ ] Maintenance report loads.
- [ ] Support report loads.
- [ ] CSV exports work for permitted roles.
- [ ] CSV exports are blocked for non-permitted roles.

## J. Mobile Checks

- [ ] Public pages are usable on mobile.
- [ ] Login pages are usable on mobile.
- [ ] Admin portal is acceptable on mobile.
- [ ] Client dashboard is usable on mobile.
- [ ] Tables are usable on mobile.
- [ ] Drawers are usable on mobile.
- [ ] No critical buttons or form fields are clipped.

## K. Final Go/No-Go

- [ ] Critical bugs: none open.
- [ ] Medium bugs: reviewed and accepted or fixed.
- [ ] Low bugs: documented.
- [ ] Security checks passed.
- [ ] Storage checks passed.
- [ ] Auth checks passed.
- [ ] Role/permission checks passed.
- [ ] Launch decision: Go / No-Go.
- [ ] Decision owner and date recorded.

## Final Staging Commands

Run these from a clean staging shell with staging environment variables loaded:

```sh
npm install
npm run build:tailwind
npm run check:storage
STORAGE_CONNECTIVITY_TEST=true npm run check:storage
npm run test:api
npm test
npm run lint
node -e "require('./server/server')"
npm start
```
