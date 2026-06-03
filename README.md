# AutomateX Business Control Center

AutomateX is a single Express/MongoDB application that powers the public AutomateX website plus protected admin and client portals. The goal is to keep the business website, operations dashboard, billing tools, and client workspace inside one professional control center.

## Current Features

- Public AutomateX website with service, pricing, portfolio-style, review, booking, and contact sections.
- Admin login and admin control center.
- Client login, signup, and client dashboard.
- JWT authentication with admin/client route protection.
- Client account approval, package assignment, payment status, and feature access management.
- Bookings, inquiries, reviews, invoices, support requests, reports, and settings.
- Project Management backend foundation with admin CRUD APIs and client read-only project visibility.
- Optional Resend email, OpenAI chat, and Stripe billing integration hooks.

## Main Folders

- `public/` - Static website, admin portal, client portal, login pages, CSS, images, and browser scripts.
- `server/` - Express app, routes, controllers, middleware, Mongo models, utilities, and backend scripts.
- `server/models/` - Active Mongoose models used by the application.
- `server/routes/` - API route modules.
- `server/controllers/` - API business logic.
- `server/middleware/` - Authentication, role guards, plan gates, and rate limiting.
- `api/` - Vercel serverless entry point.
- `scripts/` - Local maintenance scripts.

## Install

```bash
npm install
```

## Run Locally

1. Copy `.env.example` to `.env`.
2. Set the required environment variables.
3. Start the local server:

```bash
npm run dev
```

The server defaults to `PORT=5000` unless `PORT` is set. If using the sample `.env.example`, open:

```text
http://localhost:5001
```

Important: do not open the login/dashboard HTML files directly with `file://`. Authentication and dashboard data require the Express backend.

## Available Scripts

- `npm start` - Run the production Express server with `node server.js`.
- `npm run dev` - Run the server with `nodemon`.
- `npm run build:tailwind` - Compile local Tailwind CSS to `public/assets/css/tailwind.css`.
- `npm run check:storage` - Validate local or S3/R2 storage configuration.
- `npm run test:api` - Run API-focused tests.
- `npm test` - Run the full Node test suite.
- `npm run lint` - Run ESLint over JavaScript files.
- `npm run seed:admin` - Create or promote an admin user using environment variables.

## Required Environment Variables

- `MONGO_URI` or `MONGODB_URI` - MongoDB connection string.
- `JWT_SECRET` - Strong private JWT signing secret.
- `ALLOWED_ORIGINS` - Comma-separated origins allowed to call the API.
- `PUBLIC_APP_URL` - Canonical app URL used in generated links.
- `CLIENT_DASHBOARD_URL` - Client dashboard URL used in account emails and links.
- `PASSWORD_RESET_URL` - Password reset page URL.

Recommended:

- `JWT_EXPIRES_IN` - JWT lifetime, defaults to `7d`.
- `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` - Used by `npm run seed:admin`.

Optional integrations:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `OPENAI_API_KEY`
- `OPENAI_CHAT_ENABLED`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_STARTER_PRICE_ID`
- `STRIPE_STANDARD_PRICE_ID`
- `STRIPE_PRO_PRICE_ID`

Storage:

- `STORAGE_DRIVER=local` - Development only.
- `STORAGE_DRIVER=s3` - Required for staging and production file uploads.
- `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_FORCE_PATH_STYLE` - Required for R2/S3 storage.
- `S3_PUBLIC_BASE_URL` - Leave empty for private backend-streamed downloads unless public object delivery has been approved.

## Frontend Assets And CSP

- Tailwind CDN has been removed.
- Google Fonts have been removed.
- Run `npm run build:tailwind` before staging or production deployment.
- The hardened CSP expects local assets with `script-src 'self'`, `style-src 'self'`, `font-src 'self'`, `script-src-attr 'none'`, and `object-src 'none'`.

## API Areas

- `/api/auth` - Signup, login, logout, current user, client profile update.
- `/api/admin` - Admin-only stats, clients, invoices, bookings, inquiries, reviews, support requests, reports, settings, and projects.
- `/api/projects` - Client-only project list and project detail access.
- `/api/bookings` - Public and client booking flows.
- `/api/inquiries` - Public and client inquiry flows.
- `/api/reviews` - Public reviews, client review management, admin moderation.
- `/api/invoices` - Client invoice view.
- `/api/requests` - Client support and upgrade requests.
- `/api/billing` - Stripe checkout, portal, success, and webhook routes.
- `/api/chat` - Public website chat endpoint.

## Project Management Foundation

Projects are stored in `server/models/Project.js` and linked to client `User` records. Admins can create, update, list, view, archive, and manage progress, status, milestones, and deliverables through protected admin APIs. Clients can only view their own non-archived projects and never receive private admin notes.

Supported project data includes:

- Client link
- Project title and type
- Package name
- Status and priority
- Start date, expected deadline, completed date
- Total, paid, and balance amounts
- Progress percentage
- Description, requirements, client notes, admin notes
- Milestones and deliverables
- Created/updated user references
- Archive state

## Deployment Notes

The repository includes:

- `vercel.json` for Vercel static plus serverless API deployment.
- `railway.json` for Railway deployment using `npm run start`.
- `CNAME` for the configured domain.

Before production deployment, configure required environment variables in the hosting provider dashboard and redeploy after changing secrets. Never commit `.env`, database connection strings, JWT secrets, Stripe secrets, OpenAI keys, or email provider keys.

## Development Notes

- Active models live in `server/models/`.
- The old root `models/` folder was retired because the app consistently imports models from `server/models/`.
- `.DS_Store`, `node_modules`, local files, uploads, logs, coverage, and `.env` files are ignored.
- Automated API tests live under `test/api/`. Manual QA checklists still cover staging workflows that require browser, email, payment, role, and storage verification.
