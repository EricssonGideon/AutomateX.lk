# POS Licensing Server-Only Secret Contract

## Scope and stop state

This prepares the Company System for later POS licensing secret injection. It does not create a production key, provision a database, configure a distributed limiter, mount a route, or activate licensing.

## Approved loading path

Staging and production values are read only from the server process environment. The process environment may be populated directly by the approved runtime platform or by a secret manager that injects environment variables. `POS_LICENSING_SECRET_SOURCE` records the approved mechanism: `runtime-environment` or `secret-manager`.

Local `.env` loading is limited to development and test. If `AUTOMATEX_ENV` is `staging` or `production`, or `NODE_ENV` is `production`, dotenv loading is skipped. A production or staging process therefore cannot acquire its secret identity from a local file.

`POS_LICENSING_SECRET_ENVIRONMENT` must exactly match `AUTOMATEX_ENV`. Production remains fail-closed; staging validates its own identity while licensing remains inactive.

## Contract fields

| Name | Classification | Rule |
| --- | --- | --- |
| `MONGO_URI` | Secret | Exact POS database URI; never returned by configuration serialization. |
| `POS_LICENSING_SIGNING_PRIVATE_JWK_B64` | Secret | Base64 JSON Ed25519 private JWK, loaded only by the signing provider. |
| `POS_LICENSING_EXPECTED_PUBLIC_JWK` | Integrity-critical server configuration | Injected with signing configuration and checked against the derived public key. |
| `UPSTASH_REDIS_REST_URL` | Secret endpoint configuration | HTTPS Upstash REST endpoint for the concrete `upstash-rest` adapter; injected server-side only. |
| `UPSTASH_REDIS_REST_TOKEN` | Secret | Upstash REST bearer token for the concrete adapter; injected server-side only. |
| `POS_LICENSING_RATE_LIMIT_STORE_URI` | Secret | Connection URI used only by other future approved adapter implementations. |
| `POS_LICENSING_SIGNING_KEY_ID` | Identity metadata | Production uses the approved production ID; staging uses a staging ID if signing material is present. |
| `POS_LICENSING_SECRET_ENVIRONMENT` | Identity metadata | Must be `staging` or `production` and match the runtime. |
| `POS_LICENSING_SECRET_SOURCE` | Source metadata | Must be `runtime-environment` or `secret-manager`. |

The secret provider stores raw values in private class state. Its JSON and inspection representations expose only environment, source, and configured/not-configured booleans. Server callers use explicit accessors when a connection or signing operation needs a value. The Upstash adapter reads its URL and token only from the injected server environment and never from its generic store contract.

## Rejected sources

POS server configuration is never accepted from request bodies, query strings, headers, frontend JavaScript, public assets, admin DTOs, MongoDB documents, or audit metadata. Request boundaries reject server-secret field names even when nested. Source-controlled files contain names and dummy placeholders only. Production does not accept test-fixture identity or local dotenv fallback.

## Output protection

Readiness reports contain boolean checks and stable codes only. Health responses contain service/database state only. POS admin serializers do not receive the secret provider. Targeted sanitization removes POS credentials, Upstash REST URLs/tokens, credential-bearing MongoDB/Redis URIs, bearer tokens, raw activation/renewal credentials, and private JWK material from log and audit text while retaining harmless operational fields.

## Accidental-secret scan

Run `npm run check:pos-licensing-secrets`. It scans tracked and non-ignored repository files for likely Ed25519 private JWK material, credential-bearing MongoDB/Redis URIs, authorization tokens, and raw renewal credentials. Findings report only the relative file and category; matching values are never printed.
