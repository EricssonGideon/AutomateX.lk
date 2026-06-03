# Tailwind CSP Final Test Checklist

Use this checklist after deploying the local Tailwind CSS bundle and stricter CSP.

## Public Pages

- [ ] Public homepage visual check: `/`
- [ ] Pricing page visual check: `/pricing.html`
- [ ] Mobile layout check for homepage, pricing, login, admin dashboard, and client dashboard
- [ ] Browser console check for CSP violations and missing static assets
- [ ] Local Tailwind CSS build check: run `npm run build:tailwind`
- [ ] CSP header check confirms:
  - [ ] `script-src 'self'` is present
  - [ ] `style-src 'self'` is present
  - [ ] `font-src 'self'` is present
  - [ ] `script-src` does not include `unsafe-inline`
  - [ ] `script-src` does not include `https://cdn.tailwindcss.com`
  - [ ] Google Fonts origins are not present
  - [ ] `script-src-attr 'none'` is present
  - [ ] `style-src` does not include `unsafe-inline`
  - [ ] `object-src 'none'` is present

## Authentication

- [ ] Admin login visual check: `/admin-login.html`
- [ ] Client login visual check: `/client-login.html`
- [ ] General login and signup visual check: `/login.html`
- [ ] Password reset check from `/login.html`

## Admin Dashboard

- [ ] Admin dashboard visual check: `/admin.html`
- [ ] Role-gated UI check for owner/admin/staff permissions
- [ ] Project drawer check
- [ ] Invoice PDF download check
- [ ] File upload/download check
- [ ] Reports filter check

## Client Dashboard

- [ ] Client dashboard visual check: `/dashboard.html`
- [ ] Project, invoice, file, request, and settings tabs render without console errors
- [ ] File download check from a client project
- [ ] Upgrade/request workflow check
