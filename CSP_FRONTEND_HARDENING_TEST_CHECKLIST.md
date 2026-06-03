# CSP Frontend Hardening Test Checklist

Use this checklist after deploying the extracted static frontend assets to staging.

## Login And Session

- [ ] `/login.html` loads without browser console errors.
- [ ] Client login works.
- [ ] Client signup still works.
- [ ] Password reset request works.
- [ ] Password reset with token works.
- [ ] `/admin-login.html` loads without browser console errors.
- [ ] Admin login works.
- [ ] Logout clears the correct session state.
- [ ] CSRF-protected authenticated requests still send `X-CSRF-Token`.

## Admin

- [ ] `/admin.html` loads after admin login.
- [ ] Role-based UI hiding works for manager and staff accounts.
- [ ] Client drawer opens and closes.
- [ ] Project drawer opens and closes.
- [ ] Project file upload works.
- [ ] Project file download works.
- [ ] Invoice PDF download works.
- [ ] Reports filters and exports work.
- [ ] Audit log page still loads for authorized admin users.

## Client Dashboard

- [ ] `/dashboard.html` loads after client login.
- [ ] Dashboard theme preference still applies before the page paints.
- [ ] Client project list loads.
- [ ] Client can download a `Client Visible` file.
- [ ] Client cannot access `Admin Only` files.
- [ ] Invoices tab loads and invoice PDF download works.
- [ ] Requests tab create/close flows work.
- [ ] Billing portal buttons still call the API.

## Public Pages

- [ ] `/index.html` loads without browser console errors.
- [ ] `/pricing.html` loads without browser console errors.
- [ ] Pricing interactions still work.
- [ ] Public inquiry form still works.
- [ ] Public booking flow still works.

## CSP Header

- [ ] Response header includes `script-src 'self'`.
- [ ] Response header includes `style-src 'self'`.
- [ ] Response header includes `font-src 'self'`.
- [ ] Response header does not include `'unsafe-inline'`.
- [ ] Response header does not include `https://cdn.tailwindcss.com`.
- [ ] Response header does not include Google Fonts origins.
- [ ] Response header includes `script-src-attr 'none'`.
- [ ] Response header includes `object-src 'none'`.
- [ ] Local Tailwind CSS was built with `npm run build:tailwind` before deployment.
- [ ] Browser console shows no CSP violations during admin login, client login, admin dashboard, client dashboard, and pricing smoke tests.
