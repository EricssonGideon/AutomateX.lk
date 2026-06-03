# R2 Storage Staging Test Checklist

Use this checklist before switching AutomateX project files to Cloudflare R2 in production.

## Environment

- [ ] Staging uses a dedicated Cloudflare R2 bucket, not the production bucket.
- [ ] `STORAGE_DRIVER=s3`.
- [ ] `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`.
- [ ] `S3_REGION=auto`.
- [ ] `S3_BUCKET=<staging-r2-bucket-name>`.
- [ ] `S3_ACCESS_KEY_ID` is set from a Cloudflare R2 API token.
- [ ] `S3_SECRET_ACCESS_KEY` is set from the same Cloudflare R2 API token.
- [ ] `S3_FORCE_PATH_STYLE=true`.
- [ ] `S3_PUBLIC_BASE_URL` is empty unless public bucket/custom-domain delivery has been explicitly approved.
- [ ] No real R2 credentials are committed to git, issue trackers, logs, screenshots, or checklist files.

## Preflight

- [ ] Run `npm run check:storage` with staging environment variables loaded.
- [ ] Confirm the script prints `STORAGE_DRIVER: s3`.
- [ ] Confirm missing R2 config gives a clear error by temporarily unsetting one required variable in a safe shell.
- [ ] Optional: run `STORAGE_CONNECTIVITY_TEST=true npm run check:storage` from the staging environment only.
- [ ] Start the server with `STORAGE_DRIVER=s3`.
- [ ] Confirm server startup does not require real R2 credentials during normal `npm test`.

## Upload And Validation

- [ ] Admin can upload an allowed PDF.
- [ ] Admin can upload an allowed image.
- [ ] Admin can upload an allowed document.
- [ ] Dangerous file type is blocked, for example `.exe` or `.sh`.
- [ ] MIME mismatch is blocked, for example a `.pdf` filename with `text/javascript`.
- [ ] Uploaded object appears under the `project-files/YYYY/MM/` prefix in the R2 bucket.

## Download And Access Control

- [ ] Admin can download the uploaded file.
- [ ] Client can see a `Client Visible` uploaded file for their own project.
- [ ] Client can download a `Client Visible` uploaded file for their own project.
- [ ] Client cannot see an `Admin Only` uploaded file.
- [ ] Client cannot download an `Admin Only` uploaded file.
- [ ] Another client cannot see the file.
- [ ] Another client cannot download the file, even with a copied download URL.
- [ ] Audit log records admin file download with `files.downloaded`.

## Regression

- [ ] Switch staging back to `STORAGE_DRIVER=local`.
- [ ] Run `npm run check:storage`.
- [ ] Confirm an allowed local upload still works.
- [ ] Confirm local download still works.
- [ ] Run `npm run test:api`.
- [ ] Run `npm test`.
- [ ] Run `npm run lint`.

## Notes

- Keep the R2 bucket private for the current backend-streaming model.
- Leave `S3_PUBLIC_BASE_URL` empty for private backend streaming.
- If `S3_PUBLIC_BASE_URL` is set, downloads redirect to that URL instead of streaming through the backend.
