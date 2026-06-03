# Project Files and Maintenance Test Checklist

## Admin File / Document Tests

- Log in as an admin and open the Projects section.
- Open an existing project and confirm the Project Files area appears.
- Add a project file by uploading an allowed file type such as PDF, DOCX, PNG, CSV, or ZIP.
- Add a project file by entering a valid `https://` file link.
- Confirm dangerous file types such as `.exe`, `.sh`, `.bat`, `.js`, and `.msi` are rejected.
- Confirm files larger than 10 MB are rejected.
- Confirm the file list shows title, type, visibility, uploaded date, file size/link state, and actions.
- Download an uploaded file as admin.
- Download a linked file as admin.
- Change a file from Admin Only to Client Visible and back again.
- Archive a file and confirm it no longer appears in the active project file list.

## Client File Visibility Tests

- Log in as the client assigned to the project.
- Open My Projects and confirm the Project Documents section appears.
- Confirm Client Visible files are shown with title, type, date, and download button.
- Confirm Admin Only files are not shown.
- Download a Client Visible file as the assigned client.
- Attempt to access another client's file download endpoint and confirm the request returns 404 or 403.
- Attempt to access an Admin Only file download endpoint as a client and confirm it is blocked.
- Confirm the empty state appears when no client-visible documents exist.

## Maintenance Creation / Update Tests

- Log in as admin and open Projects.
- Use Create Plan in the Maintenance panel.
- Create a maintenance plan linked to an existing project.
- Confirm negative amount and negative paid amount are rejected.
- Confirm paid amount greater than amount is rejected.
- Confirm invalid dates are rejected.
- Confirm included services save and render correctly.
- Edit an existing maintenance plan and confirm changes persist.
- Confirm admin notes are visible in admin edit view.
- Confirm client-visible notes are visible to the client.

## Renewal / Expiry Tests

- Mark a plan as renewed and confirm status becomes Active.
- Set renewal date within 30 days and confirm admin/client display shows Expiring Soon.
- Mark a plan as expired and confirm status updates.
- Mark a plan as cancelled and confirm status updates.
- Confirm payment status filters show Paid, Pending, Partial, and Overdue plans correctly.

## Security Tests

- Confirm all admin project-file and maintenance routes require a valid admin token.
- Confirm all client project-file and maintenance routes require a valid active client token.
- Confirm inactive client accounts cannot access client project files or maintenance plans.
- Confirm client maintenance API responses do not include `adminNotes`.
- Confirm client project API responses do not include Admin Only files.
- Confirm invalid ObjectIds return clear 400 errors.
- Confirm missing records return clear 404 errors.

## Mobile UI Tests

- Open `public/admin.html` on a mobile viewport and confirm Projects, Project Files, and Maintenance panels remain usable.
- Open the project drawer on mobile and confirm file and maintenance forms do not overflow horizontally.
- Open `public/dashboard.html` on a mobile viewport and confirm Project Documents and Maintenance Status sections stack cleanly.
- Confirm document download buttons remain tappable on mobile.
