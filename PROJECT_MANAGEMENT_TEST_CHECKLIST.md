# Project Management Manual Test Checklist

Use this checklist after starting the app with a valid MongoDB connection and seeded admin account.

## Admin Access

- Log in through `/admin-login.html` with the official admin account.
- Confirm the Projects item appears in the admin sidebar.
- Confirm `/api/admin/projects` returns `401` without a token.
- Confirm `/api/admin/projects` returns `403` with a client token.

## Admin Project Creation

- Open Admin -> Projects.
- Click Create Project.
- Select an active client.
- Enter a project title, type, package, status, priority, dates, total amount, paid amount, progress, description, requirements, client notes, admin notes, milestones, and deliverables.
- Save the project.
- Confirm the project appears in the admin project table.
- Confirm the project balance equals total amount minus paid amount.
- Try a negative total or paid amount and confirm the API returns a clear validation error.
- Try paid amount greater than total amount and confirm the API blocks it.

## Admin Project List and Filters

- Filter by status.
- Filter by priority.
- Filter by project type.
- Search by project title.
- Search by client name, email, or business name.
- Confirm table columns show project title, client, type, status, priority, progress, deadline, balance, and actions.

## Admin Project Update

- Open an existing project.
- Change status and progress.
- Update milestones and deliverables.
- Save the project.
- Refresh the page and confirm changes persist.
- Archive the project and confirm it no longer appears in active project lists.

## Client Project Access

- Log in as the client linked to the project.
- Confirm My Projects appears in `/dashboard.html`.
- Confirm the client can see their own project title, type, status, progress, milestones, deliverables, deadline, total amount, paid amount, balance, description, and client notes.
- Confirm private admin notes do not appear in the client dashboard.
- Confirm `GET /api/projects` only returns projects for the logged-in client.
- Confirm `GET /api/projects/:id` returns `404` when the project belongs to another client.

## Invalid ID Handling

- Call `GET /api/admin/projects/not-a-valid-id` with an admin token and confirm a `400` response.
- Call `GET /api/projects/not-a-valid-id` with a client token and confirm a `400` response.

## Regression Checks

- Public home page still loads.
- Pricing page still loads.
- Admin login still works.
- Client login still works.
- Existing admin sections still load: clients, invoices, payments, bookings, inquiries, reviews, support, reports, settings.
- Existing client sections still load: overview, bookings, inquiries, reviews, invoices, requests, settings, upgrade.
