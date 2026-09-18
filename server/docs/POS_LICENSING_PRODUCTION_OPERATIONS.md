# POS Licensing Production Operations (Part 77)

Part 77 prepares the existing Company System POS licensing backend for a future production deployment. It does not mount the machine or POS Control routes, provision a live database, generate the final keypair, configure a live endpoint, or change POS Standard.

## Deployment gate

POS licensing is disabled when `POS_LICENSING_MODE` is absent or set to `disabled`. Development and test modes remain isolated. Production mode validates the complete production contract before creating the Express app. The Part 78F aggregate gate combines every technical check with the separate `POS_LICENSING_ENABLED` decision. Passing checks make route mounting eligible only when that flag is explicitly enabled; they never mount or activate routes automatically.

Run the safe readiness command before any future deployment:

```sh
npm run check:pos-licensing-production
```

It emits only named pass/fail checks and safe reason codes. It never emits a MongoDB URI, rate-limit store URI, JWK, private key, activation code, renewal credential, or authorization value. A non-ready result exits non-zero.

## Required production configuration

All values must be supplied by the production runtime or approved server secret manager. There is no development fallback.

| Variable | Requirement |
| --- | --- |
| `AUTOMATEX_ENV` | Must be `production`; staging and production runtimes cannot be inferred from `NODE_ENV`. |
| `NODE_ENV` | Must be `production`. |
| `POS_LICENSING_MODE` | Must be explicitly `production` to activate the readiness gate. |
| `POS_LICENSING_ENABLED` | Must remain `false` until every operator decision is approved; missing, false, and malformed values are inactive. |
| `POS_LICENSING_ENVIRONMENT` | Must be explicitly `production`. |
| `POS_LICENSING_CLIENT_SCOPE` | Must be explicitly `production-only`. |
| `POS_LICENSING_SECRET_ENVIRONMENT` | Must be `production` and match `AUTOMATEX_ENV`. |
| `POS_LICENSING_SECRET_SOURCE` | Must be `runtime-environment` or `secret-manager`. |
| `MONGO_URI` | Authenticated, certificate-validating TLS production MongoDB URI with an explicit database. `MONGODB_URI` is not accepted as a licensing fallback. |
| `POS_LICENSING_DATABASE_NAME` | Exact dedicated name containing `pos` and `production`/`prod` markers; it must match the URI path. |
| `POS_LICENSING_SIGNING_PRIVATE_JWK_B64` | Base64-encoded private Ed25519 JWK supplied only as a server secret. |
| `POS_LICENSING_EXPECTED_PUBLIC_JWK` | Approved public-only Ed25519 JWK used for consistency validation. It is unresolved until the operator supplies the final production public key. |
| `POS_LICENSING_SIGNING_KEY_ID` | Must equal `automatex-pos-prod-ed25519-v1`. |
| `POS_LICENSING_MACHINE_API_BASE_PATH` | Isolated machine namespace, currently planned as `/api/pos-machine/v1`. |
| `POS_LICENSING_MACHINE_API_ORIGIN` | Explicit credential-free, non-local HTTPS API origin. |
| `POS_LICENSING_PRODUCTION_HOSTNAME` | Approved production machine API hostname; must match the machine origin. |
| `POS_LICENSING_STAGING_HOSTNAME` | Approved staging hostname; required for staging and optional-but-validated during production checks. |
| `POS_LICENSING_PROXY_TRUST_MODE` | Explicitly `direct`, `cidr`, or verified-runtime `vercel`; missing/unresolved configuration blocks readiness. Vercel Preview is permitted only for staging and Vercel Production only for production. |
| `POS_LICENSING_TRUSTED_PROXY_CIDRS` | Bounded approved proxy ranges required only for `cidr`; universal trust is rejected. |
| `POS_LICENSING_PRODUCTION_ADMIN_ORIGINS` | Exact HTTPS production Company System origins allowed for future POS Control browser requests. |
| `POS_LICENSING_STAGING_ADMIN_ORIGINS` | Exact HTTPS staging Company System origins; must be disjoint from production. |
| `POS_LICENSING_MACHINE_ALLOWED_ORIGINS` | Must currently be `none`; native machine requests do not need browser CORS. |
| `POS_LICENSING_RATE_LIMIT_BACKEND` | Distributed backend identifier; `upstash-rest` selects the prepared HTTP adapter. Memory/local/none are rejected. |
| `POS_LICENSING_RATE_LIMIT_STORE_IDENTITY` | Explicit environment-bound store identity, for example `automatex-pos-production-distributed-v1`. |
| `POS_LICENSING_RATE_LIMIT_NAMESPACE` | Explicit environment-bound base namespace; endpoint suffixes are generated independently. |
| `UPSTASH_REDIS_REST_URL` | Server-only HTTPS REST endpoint required by `upstash-rest`. |
| `UPSTASH_REDIS_REST_TOKEN` | Server-only bearer token required by `upstash-rest`. |
| `POS_LICENSING_RATE_LIMIT_STORE_URI` | Server-only connection URI required only by another future approved adapter. |
| `POS_LICENSING_RATE_LIMIT_WINDOW_MS` | Positive integer shared window. |
| `POS_LICENSING_ACTIVATION_RATE_LIMIT` | Positive integer activation limit per window. |
| `POS_LICENSING_BOOTSTRAP_RATE_LIMIT` | Positive integer bootstrap limit per window. |
| `POS_LICENSING_RENEWAL_RATE_LIMIT` | Positive integer renewal limit per window. |
| `POS_LICENSING_AUDIT_ENABLED` | Must be explicitly `true`. |
| `POS_LICENSING_AUDIT_RETENTION` | Must be explicitly `indefinite`; history is not TTL-deleted. |
| `POS_LICENSING_MONGODB_TRANSACTIONS_REQUIRED` | Must be explicitly `true`. |

The `.env.example` contains placeholders only. Do not place a real private JWK or backend credential in source-controlled files.

## Signing key handling

`server/config/posLicensingSecrets.js` is the server-only value boundary and `server/config/posLicensingProduction.js` validates and loads the signing provider. Key material is accepted only from injected `POS_LICENSING_SIGNING_PRIVATE_JWK_B64`; there is no MongoDB, request-body, frontend, POS Control, source-file, generated-key, test-key, or development-key fallback.

The loader validates that:

- the private JWK is an object with `kty: OKP`, `crv: Ed25519`, and both `x` and `d`;
- Node can import it as an Ed25519 private `KeyObject`;
- its derived public key matches its declared `x` value;
- the derived public key matches the public-only `POS_LICENSING_EXPECTED_PUBLIC_JWK`;
- any JWK `kid` and the configured key ID match `automatex-pos-prod-ed25519-v1`.

Any mismatch fails closed. Errors contain reason codes, never key contents. The key provider returns only server-side `KeyObject` instances to the existing signing service.

The final keypair must not be generated until the operator identifies and approves the external secret destination. The final public key is still a deployment blocker.

## Database collections and indexes

All existing schemas use `autoCreate: false` and `autoIndex: false`. Production collections are therefore deliberate and are not created by normal application startup.

| Collection | Purpose | Important prepared indexes |
| --- | --- | --- |
| `pospackages` | POS package policy | unique `packageCode` (also the lookup prefix when checking Mongoose `__v`); edition/status lookup |
| `poslicences` | Client licence authority | client/status, project/status, package/status |
| `posinstallations` | Bound device installations and renewal verifier | unique licence/device identity; device lookup; unique non-empty renewal credential hash |
| `posactivationcodes` | One-time activation authority | unique activation-code hash; licence/status; expiry lookup without TTL |
| `poslicenceissues` | Immutable activation/renewal issue and replay history | licence/installation/time; activation replay uniqueness; renewal predecessor/version uniqueness |
| `poslifecycleauthorityevents` | Prepared future lifecycle command history | unique command ID; unique installation/sequence; client/licence history; no operational route |
| `auditlogs` | POS licensing and Company System audit records | module/time, actor/time, target lookup; no TTL |

Renewal/bootstrap state is stored on `posinstallations` and in immutable `poslicenceissues`; it does not need a duplicate credential collection. Activation and audit expiry dates are query fields only. There are deliberately no TTL indexes because activation lifecycle, issue history, lifecycle authority history, and audits must remain reviewable.

Inspect the idempotent plan without connecting or writing:

```sh
npm run provision:pos-licensing
```

The future apply path requires both `--apply` and `POS_LICENSING_PROVISION_CONFIRM=PROVISION_AUTOMATEX_POS_LICENSING`, plus a fully valid production configuration. `createCollection` handles an existing collection and `createIndex` uses deterministic definitions, so reruns converge. Do not use the apply path until the production database target is approved.

## Transaction and retry requirements

Activation redemption, activation-code issuance, renewal-credential bootstrap, licence renewal, and lifecycle state transitions reuse the existing `withTransaction` runners. They retry MongoDB errors labelled `TransientTransactionError` up to the bounded service policy and do not downgrade to non-transactional writes.

The readiness probe runs MongoDB `hello`, requires logical sessions and either a replica set or sharded `mongos`, then performs a read-only snapshot transaction with majority write concern. A standalone server, missing session API, failed topology query, or failed transaction probe makes production readiness fail.

Existing retry behavior is retained:

- activation uses unique licence/device identity plus a unique activation issue key and replays the committed signed payload after a lost response;
- activation counters and code consumption use versioned compare-and-update inside one transaction, so a duplicate cannot consume another installation;
- bootstrap binds one client-generated credential digest with a versioned conditional update, acknowledges the same digest on retry, and rejects a competing digest;
- renewal keys replay by installation, predecessor-signature hash, and credential version, while the installation `lastIssueId` prevents branching or contradictory current state;
- future lifecycle commands have unique `commandId` and unique `(installationId, sequence)` indexes to control duplicate command creation.

## Rate limiting

The machine router retains independent activation, bootstrap, and renewal limiters. `server/licensing/posLicensingRateLimit.js` defines the vendor-neutral adapter contract and constructs independent environment-bound namespaces through a server-only factory. Keys contain the operation plus a SHA-256 digest of the normalized network identity; request bodies, activation codes, renewal credentials, authorization headers, signing material, and raw IP addresses are never included.

Every adapter must declare itself distributed, reject local-only keys, expose matching backend/environment/store/namespace metadata, implement `increment`, `decrement`, `resetKey`, and `healthCheck`, and return a healthy result during readiness. Store exceptions are replaced by a stable sanitized failure. Production readiness fails when the factory is missing, an adapter is local or mismatched, any namespace is reused, or health verification fails. There is no memory fallback.

`server/licensing/upstashRateLimitStore.js` is the concrete `upstash-rest` implementation. It uses one-shot HTTPS REST requests suitable for serverless execution, applies increment and first-window expiry atomically with a Redis script, hashes the already-opaque request key before storage, and uses `PING` for adapter health. It reads only `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from server runtime injection. URLs, tokens, response bodies, headers, and raw backend errors never enter adapter errors or readiness output.

Staging identities and namespaces must explicitly contain `staging` and must not contain production, test, development, or local markers. Production has the inverse boundary. This prevents counters and configuration from being silently shared across the two environments.

The Upstash REST adapter is now available for staging configuration, but this change does not deploy it or contact a live store. Staging must use a staging-only store identity and namespace. Production provider approval, production-only credentials, live health verification, availability monitoring, and route wiring remain required before mounting.

## Transport, proxy, host, and origin policy

Part 78E replaces the previous one-hop global proxy trust with a conservative default. `direct` trusts only socket TLS and ignores forwarded protocol, host, and client identity. `cidr` trusts forwarded protocol and host only when the immediate socket peer matches an explicit bounded CIDR list. Numeric hop trust, universal CIDRs, and unresolved topology are rejected for production licensing readiness.

The current environment's machine API hostname must be an explicit, valid non-local DNS name. The opposite environment's hostname is optional, but remains validated when configured; when both are present they must differ. The HTTPS origin must exactly match the current hostname and cannot contain credentials, a wildcard, path, query, or fragment. The prepared request guard returns an error for insecure or unexpected-host requests and never redirects them into trusted state.

Native POS machine calls are originless HTTP clients and do not require browser CORS, so machine browser origins remain disabled. Future POS Control browser routes use a separate exact Company System origin allowlist with credentials. General public/staff/client CORS membership is not POS Control authorization; the existing server-side Admin-only permission boundary remains mandatory.

## Authentication and route separation

The planned groups are intentionally separate:

- Machine: `/api/pos-machine/v1` for activation, bootstrap, renewal, and future trusted machine lifecycle delivery. Machine proof is endpoint-specific and cannot establish a Company System user session.
- Owner/Admin: `/api/admin/pos-licensing` for package, licence, installation, activation-code, approval/revocation, and future approval workflows. Every request must pass `verifyToken`, `requireTrustedLicenceAdmin`, and the explicit licence permission.
- Staff/employee APIs: existing namespaces and permissions; no licensing administration permission.
- Client APIs: existing account namespace; no licensing administration permission.
- Public website: existing public routes/assets; no licensing administration or machine credential acceptance.

The POS Control router performs server-side authorization. `requireTrustedLicenceAdmin` accepts only the trusted `admin` role, and the role map grants licence permissions only through the admin wildcard. Anonymous users receive authentication failure; clients, managers, staff, employees, and machine credentials are rejected. Sidebar visibility and frontend checks are not security boundaries.

Neither `server/routes/posActivation.js` nor `server/routes/posLicenceAdmin.js` is mounted by `server/routes/index.js`, `server/server.js`, or `server.js` in Part 77.

## Credentials and audit rules

Activation codes use 16 random bytes (128 bits) with a format prefix. Only a purpose-separated SHA-256 digest is stored. Plaintext is returned once by the authorized creation response and is absent from list/detail serializers and audit metadata. States are `draft`, `active`, `redeemed`, `revoked`, and `expired`.

Renewal credentials use 32 random bytes (256 bits). POS Standard generates the plaintext locally and sends only a purpose-separated digest during bootstrap, so the server never receives or returns bootstrap plaintext. The digest is hidden by default in Mongoose selections, excluded from DTOs/Admin UI/audits, and compared only on machine renewal paths.

Logging and audit sanitization removes password, token, secret, hash, authorization, cookie, API key, credential, activation-code, private/signing-key, and raw-request fields recursively. Machine errors use generic denial messages and sanitized reason codes. Morgan does not log request bodies or authorization headers. Never add raw request logging to machine routes.

## Lifecycle authority compatibility

`server/utils/posLifecycleAuthorityEnvelope.js` prepares, but does not expose, the Part 75-shaped authority envelope. It uses the approved key provider and the existing recursive canonical JSON routine. The envelope carries schema version, key ID, command ID, monotonic sequence, client identity, installation identity, Standard edition, action, issued-at, not-after, action-specific payload, and Ed25519 signature.

`poslifecycleauthorityevents` provides uniqueness and durable history for future issuance. The utility also requires an exact `previousSequence + 1` transition when prior sequence context is supplied; a future issuer must load and advance that value in the same transaction. Deactivation, replacement, credential rotation, delivery, and acknowledgement are not operational and have no route or UI in Part 77.

## Deployment prerequisites and blockers

Before actual production provisioning or route mounting, the operator must approve:

1. The external secret location for the final Ed25519 private key.
2. Generation/import of the final keypair and the corresponding expected public JWK.
3. The production MongoDB cluster/database and proof that the readiness transaction passes.
4. The production distributed rate-limit provider, credentials, availability monitoring, and failure policy; the `upstash-rest` adapter is implemented but no production store is selected here.
5. Exact machine API hostname/base path, TLS termination, allowed origins, and network controls.
6. Audit retention/access/backup operations and alerting.
7. A staged index rollout and backup/restore plan.
8. An explicit later change to mount routes and wire POS Standard to the approved endpoint.

Until all prerequisites are approved, keep `POS_LICENSING_MODE=disabled` and `POS_LICENSING_ENABLED=false`, do not run provisioning with `--apply`, do not mount either route group, and do not configure POS Standard with a production endpoint or public key. The authoritative remaining actions are listed in `POS_LICENSING_PRODUCTION_ACTIVATION_CHECKLIST.md`.
