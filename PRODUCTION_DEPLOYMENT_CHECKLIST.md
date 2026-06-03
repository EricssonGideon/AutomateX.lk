# AutomateX Production Deployment Checklist

Use this checklist before the first production cutover and before any security-sensitive redeploy.

## Required Environment

- `NODE_ENV=production`
- `MONGODB_URI` points to the production MongoDB cluster.
- `JWT_SECRET` is a long random production-only value stored in the host secret manager.
- `JWT_EXPIRES_IN=12h` or shorter.
- `ALLOWED_ORIGINS` includes only production HTTPS origins, for example `https://automatex.com`.
- `PUBLIC_APP_URL` is the canonical production app URL.
- `CLIENT_DASHBOARD_URL` points to the production client dashboard URL.
- `PASSWORD_RESET_URL` points to the production reset-password URL.
- `RESEND_API_KEY` is configured for the production Resend account.
- `RESEND_FROM_EMAIL` uses a verified sending domain.
- `SUPPORT_EMAIL` routes to the production support inbox.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and Stripe price IDs use live-mode values.
- `OPENAI_API_KEY` is present only if AI features are enabled in production.

## Data And Storage

- MongoDB Atlas backups are enabled and restore-tested.
- MongoDB network access is restricted to deployment egress IPs where possible.
- Database users have least-privilege credentials and production-only passwords.
- `STORAGE_DRIVER=s3` is configured for staging and production.
- `STORAGE_DRIVER=local` is for development only and is not acceptable for staging or production project-file uploads.
- Vercel and other serverless platforms require object storage for uploaded project files because local filesystem writes are not durable across instances or deployments.
- Cloud storage credentials, private bucket rules, lifecycle policies, and backup/retention policies are configured before switching to `STORAGE_DRIVER=s3`.
- Uploaded project files stay private by default and are downloaded through authenticated backend routes. Set `S3_PUBLIC_BASE_URL` only when the bucket/custom domain is intentionally public and that sharing model has been approved.

### Cloudflare R2 Setup

- Create the R2 bucket for project files in the Cloudflare dashboard.
- Create an R2 API token with object read/write access scoped to that bucket.
- Find the Cloudflare Account ID from the R2 account details or dashboard account URL.
- Set `STORAGE_DRIVER=s3`.
- Set `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`.
- Set `S3_REGION=auto`.
- Set `S3_BUCKET` to the R2 bucket name.
- Set `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` from the R2 API token.
- Set `S3_FORCE_PATH_STYLE=true`.
- Leave `S3_PUBLIC_BASE_URL` empty for private backend-streamed downloads. Set it only when a public R2 custom domain is intentionally configured and approved.
- Never commit real values for `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `.env`, production host secrets, or copied Cloudflare token screens.
- Run `npm run check:storage` with staging environment variables loaded.
- Optional live check: run `STORAGE_CONNECTIVITY_TEST=true npm run check:storage` only from a trusted staging shell.
- Test admin upload of an allowed file type.
- Test admin download of the uploaded file.
- Test client download for a `Client Visible` file owned by that client.
- Test that `Admin Only` files are hidden from the client file list and cannot be downloaded from the client route.
- Complete `R2_STORAGE_STAGING_TEST_CHECKLIST.md` before production cutover.

### AWS S3 Setup

- Create the S3 bucket for project files.
- Keep bucket public access blocked unless `S3_PUBLIC_BASE_URL` has been explicitly approved.
- Create an IAM user or role with least-privilege access to the project-file bucket.
- Attach a policy allowing only required object actions such as `s3:PutObject`, `s3:GetObject`, and `s3:AbortMultipartUpload` on the bucket path used by AutomateX.
- Set `STORAGE_DRIVER=s3`.
- Set `S3_REGION` to the bucket region.
- Set `S3_BUCKET` to the bucket name.
- Set `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`, or equivalent host-managed secrets for the IAM principal.
- Leave `S3_ENDPOINT` empty for AWS S3.
- Set `S3_FORCE_PATH_STYLE=false`.
- Set CORS only if a future direct-browser upload/download flow is intentionally introduced. The current backend-mediated flow does not require browser access to the bucket.
- Test admin upload/download of an allowed file type.
- Test client download for an owned `Client Visible` file.
- Test blocked extension and MIME mismatch rejection.

## Web Security

- HTTPS is enforced at the host or proxy.
- DNS points the production domain to the deployment target.
- HSTS is enabled by the edge/proxy after HTTPS is verified.
- `ALLOWED_ORIGINS` does not contain wildcards or development localhost origins in production.
- Auth cookies are set over HTTPS with `Secure`, `HttpOnly`, and `SameSite=Lax`.
- CSRF token headers are confirmed for admin and client unsafe API requests.
- CSP is reviewed after any frontend asset changes.
- Tailwind CDN and Google Fonts are removed; deploy the compiled local Tailwind CSS bundle instead.
- Run `npm run build:tailwind` before deployment.
- Confirm CSP includes `script-src 'self'`, `style-src 'self'`, `font-src 'self'`, `script-src-attr 'none'`, and `object-src 'none'`.
- Confirm CSP does not include `unsafe-inline`, `https://cdn.tailwindcss.com`, or Google Fonts origins.

## Email And Payments

- Resend sending domain DNS records are verified.
- Password reset, signup, and invoice email flows are tested against production inboxes.
- Stripe webhook endpoint is registered against the production URL.
- Stripe webhook signing secret is configured in production.
- Live payment test path is verified with a small transaction or Stripe-approved production test process.

## Admin Setup

- Run `npm run seed:admin` with production secrets available.
- Confirm only official admin accounts receive system-admin role access.
- Disable or rotate any temporary bootstrap credentials immediately after setup.
- Review manager/staff permissions before inviting non-admin users.

## Smoke Tests

- `npm install`
- `npm run build:tailwind`
- `npm run check:storage`
- `npm run lint`
- `npm run test:api`
- Start the production build/process with production-like environment variables.
- Open `/`, `/admin-login.html`, `/login.html`, `/admin.html`, and `/dashboard.html`.
- Log in as admin and client.
- Verify admin reports load and export.
- Verify invoice PDF download.
- Verify project file upload/download with an allowed file type.
- Verify blocked file extensions and CSRF failures are rejected.
- Verify audit logs record exports, invoice PDF downloads, and admin file downloads.

## Rollback

- Keep the previous deployment artifact available.
- Confirm database migrations or data changes are backward compatible before deploy.
- If rollback is needed, redeploy the previous artifact and keep the current database backup snapshot.
- Rotate any exposed secret immediately before or after rollback.
- Capture failing request IDs, logs, and audit entries before redeploying again.
