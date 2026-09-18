# POS Licensing Environment Separation (Part 78A)

Part 78A audits and prepares environment separation only. It does not mount POS licensing routes, generate keys, provision MongoDB, configure a rate-limit backend, modify POS Standard, or deploy infrastructure.

## Existing runtime behavior found

- `server/server.js` loads `.env`, creates the Express app, derives CORS behavior, and invokes the Part 77 POS licensing startup gate before registering application routes.
- `server.js` connects MongoDB before listening and, when production licensing is active, runs the Part 77 transaction/readiness checks.
- `server/utils/db.js` historically accepted `MONGO_URI || MONGODB_URI`; Part 77 already required `MONGO_URI` for production licensing but the connection helper retained the alias fallback.
- general security behavior historically used only `NODE_ENV === "production"`; there was no distinct staging identity.
- Railway and Vercel configuration files contain build/start routing only. They do not embed environment identity or POS secrets; those values must be supplied by each platform environment.
- machine and POS Control licensing routers remain absent from the main route registry.

## Canonical Company runtime modes

`AUTOMATEX_ENV` is the Company System deployment identity:

| `AUTOMATEX_ENV` | Required `NODE_ENV` | Classification |
| --- | --- | --- |
| `development` | unset or `development` | Local developer runtime. If both variables are absent, this is the only permitted default. |
| `test` | `test` | Automated/disposable test runtime. |
| `staging` | `production` | Production-strength framework behavior with isolated non-production data. Must be explicit. |
| `production` | `production` | Live production runtime. Must be explicit. |

An unknown mode or mismatched pair fails startup. `NODE_ENV=production` without explicit `AUTOMATEX_ENV` also fails, preventing an ambiguous staging/production deployment.

Staging and production are both treated as secure runtimes for CORS and error-stack behavior. Staging uses `NODE_ENV=production` so cookies and third-party packages also retain production security behavior.

## POS licensing mode relationship

`POS_LICENSING_MODE` remains `disabled` by default. If enabled for configuration validation, it must exactly match `AUTOMATEX_ENV`; cross-environment fallback is rejected.

| Company runtime | Allowed licensing mode |
| --- | --- |
| development | `disabled` or `development` |
| test | `disabled` or `test` |
| staging | `disabled` or `staging` |
| production | `disabled` or `production` |

Production mode preserves the complete Part 77 key, database, audit, transaction, origin, and distributed-rate-limit validation. Staging validation is separation-only in Part 78A and does not enable signing or routes.

## Production protections

When POS licensing mode is `production`:

- `AUTOMATEX_ENV`, `NODE_ENV`, `POS_LICENSING_MODE`, and `POS_LICENSING_ENVIRONMENT` must all identify production;
- `POS_LICENSING_CLIENT_SCOPE` must be `production-only`;
- only `MONGO_URI` is accepted; `MONGODB_URI` cannot fill a missing value;
- localhost MongoDB endpoints and database names containing development, test, staging, local, or mock markers are rejected;
- an explicit `POS_LICENSING_DATABASE_NAME` is passed to Mongoose and must match any database embedded in the URI;
- `POS_LICENSING_MACHINE_API_ORIGIN` must be a credential-free, non-local HTTPS origin without path/query/fragment;
- machine CORS origins must be explicit non-local HTTPS origins and cannot contain `*`;
- the Part 77 production key ID and key-consistency checks remain mandatory;
- development/test/local rate-limit or signing fallbacks remain rejected.

## Staging isolation

When POS licensing mode is `staging`:

- runtime, licensing environment, and licensing mode must all say `staging`;
- `POS_LICENSING_CLIENT_SCOPE=staging-only` is mandatory;
- `MONGO_URI` must be explicit and non-local, and `MONGODB_URI` is ignored;
- the database name must contain a staging marker and must not contain production, development, test, local, or mock markers;
- URI and explicit database names must match;
- machine API and allowed origins must use explicit non-local HTTPS origins;
- the production signing key ID is forbidden;
- if staging signing material is later supplied, its key ID must start with `automatex-pos-staging-`;
- staging signing, routes, and real client access remain inactive in Part 78A.

Database separation is the primary data boundary. `staging-only` client scope is an additional startup assertion for future query/service wiring; no staging route currently exists that can read any client records.

## Deployment configuration files

Do not place environment-specific values in `railway.json`, `vercel.json`, source files, or committed `.env` files. Configure each platform environment independently:

- local: `.env` with `AUTOMATEX_ENV=development` and licensing disabled;
- automated test: process-scoped `AUTOMATEX_ENV=test`, `NODE_ENV=test`, and disposable databases;
- staging: platform staging variables with `AUTOMATEX_ENV=staging`, separate database/configuration, and licensing disabled unless performing an approved staging-only validation;
- production: platform production variables with `AUTOMATEX_ENV=production`; licensing remains disabled until all Part 77 production blockers are approved.

Never copy an entire staging variable set into production or vice versa. Create the environments independently and compare only variable names, not secret values.

## Current stop state

Keep `POS_LICENSING_MODE=disabled`. No production/staging database has been contacted or created, no key has been generated, no limiter has been configured, and no licensing route has been mounted.
