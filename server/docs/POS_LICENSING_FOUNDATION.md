# POS Licensing Foundation

Part 47 adds Company System data and authorization foundations only. It does not add activation routes, signing keys, renewal credentials, generated activation codes, admin UI, POS public-key changes, or production package data.

## POS Contract Source

The Standard POS verifier and activation client were read from:

`/Users/robertericsson/AutomateX/Systems/AutomateX POS Systems/POS-Standard Original/app.js`

Relevant POS functions/constants:

- `STANDARD_SIGNED_LICENCE_SCHEMA_VERSION`
- `STANDARD_PRODUCTION_LICENCE_PUBLIC_KEY_JWK`
- `STANDARD_ACTIVATION_ENDPOINT`
- `STANDARD_MODULE_CATALOG`
- `STANDARD_PROVIDER_UPDATE_CHANNELS`
- `normalizeStandardSignedLicencePayload`
- `canonicalizeStandardJsonForSignature`
- `getStandardLicenceSignatureData`
- `verifyStandardSignedLicencePayload`
- `createStandardActivationRequestPayload`
- `requestStandardPosActivation`

Current POS production public key is `null` and activation endpoint is blank, so production activation is not configured.

## Signed Payload Contract

The POS Standard signed response field set is exact:

- `schemaVersion`
- `clientId`
- `installationId`
- `edition`
- `licenceStatus`
- `licenceExpiry`
- `enabledModules`
- `updateChannel`
- `supportExpiry`
- `issuedAt`
- `offlineValidUntil`
- `signature`

No `keyId`, renewal credential, package metadata, payment status, support note, or other extra field belongs in the POS signed response until the POS verifier contract changes.

The POS accepts signed `licenceStatus: "active"` only. Company System administration lifecycle states are separate database state and are not a substitute for signed payload values.

## Validation Boundaries

Contract constants live in `server/utils/posLicenceContract.js`.

Shared policy validation lives in `server/utils/posLicencePolicy.js`. Service-level checks are required for:

- package/licence module consistency
- package/licence update-channel consistency
- whether a draft has enough explicit policy to be issuable
- whether a licence issue attempts to extend `licenceExpiry`
- raw credential field rejection at input boundaries
- sanitized licence audit metadata

MongoDB indexes enforce identity and lookup constraints only. They do not prove cross-document consistency or concurrency safety.

## Validity Policy

Payment status, support expiry, and licence validity are independent.

Support expiry does not control POS licence access. Payment status does not automatically suspend or extend a POS licence. Renewal cannot extend `licenceExpiry` unless an authorized administrator first changes the underlying licence validity.

Future issuance must use chronological dates:

- `issuedAt <= offlineValidUntil`
- `issuedAt <= licenceExpiry`
- `offlineValidUntil <= licenceExpiry`

No default validity duration, activation limit, installation limit, package price, or commercial package policy is configured in Part 47.

## Future Deployment Safety

Future activation/renewal implementation must use an isolated test database first and production index rollout must be planned separately. Schema-only tests do not prove MongoDB transaction support, replica-set availability, or activation replay protection under concurrency.

## Part 48 Admin Service Foundation

`server/services/posLicenceAdminService.js` provides isolated service functions for draft POS Standard package and licence administration only:

- `createDraftPackage(actor, input)`
- `updateDraftPackage(actor, packageId, input, { expectedVersion })`
- `createDraftLicence(actor, input)`
- `updateDraftLicence(actor, licenceId, input, { expectedVersion })`
- `validateDraftPackageReadiness(actor, packageId)`
- `validateDraftLicenceReadiness(actor, licenceId)`

These services are not registered in production routes and are not imported by normal startup. Future route handlers must first run the existing `verifyToken` middleware, then pass `req.user` as the trusted `actor`. They must not pass actor IDs, roles, or permissions from `req.body`, query parameters, headers, or client-side state.

The service authorizes before reading or mutating protected records. Managers, staff, employees, clients, anonymous callers, and request-body role/permission attempts are rejected.

Draft package and licence updates require an explicit `expectedVersion` precondition. This protects against silent overwrites in service logic, but the current tests use mocked repositories; they do not prove database-level concurrent write guarantees under real MongoDB timing.

Draft package updates are rejected if the package is already referenced by a non-draft licence. A future versioning workflow is required before shared package definitions can be changed after issuance begins.

Package/licence readiness is a validation report only. Incomplete drafts may be saved, but they are not labelled issuable until all required package, project, module, channel, and date configuration is present.

Audit writes happen after persistence. If the record write succeeds and audit logging fails, the service returns a successful persistence result with `audit.ok: false`; it does not claim rollback and does not silently report audit success.

The new POS schemas explicitly set `autoCreate: false` and `autoIndex: false`. Future deployment must provision POS collections and indexes intentionally in a controlled database maintenance step; no Part 48 service call should be connected to public routes until that provisioning plan is tested in an isolated database.

## Part 49 MongoDB Integration Verification

`test/api/pos-licence-mongodb-integration.test.js` is intentionally opt-in. Run it only with:

`AUTOMATEX_POS_MONGO_INTEGRATION=1 node --test test/api/pos-licence-mongodb-integration.test.js`

The test starts its own disposable local `mongod` bound to `127.0.0.1`, uses a database name beginning with `automatex_pos_licensing_it_`, explicitly creates the required collections and indexes, and then drops only the exact collections it created before removing the exact temporary dbpath.

Production provisioning must create collections and indexes for:

- `pospackages`: unique `packageCode`, plus edition/status lookup
- `poslicences`: client/status, project/status, and package/status lookups
- `posinstallations`: unique `(licenceId, deviceInstallationId)`, plus device lookup
- `posactivationcodes`: unique `codeHash`, plus licence/status lookup
- `poslicenceissues`: licence/installation/issuedAt lookup, payload digest lookup, and unique partial `(activationCodeId, installationId, issueReason)` for activation issues

The current package-in-use guard is a service-level check before a draft package update. It prevents editing packages already referenced by non-draft licences at the time of the check, but it is not a transactionally atomic barrier against a simultaneous future licence-state transition. When activation or lifecycle transitions are implemented, package mutation and licence-state transition paths must share a transaction, lock, or versioned package publication workflow.

## Part 50 Unmounted Admin API

`server/routes/posLicenceAdmin.js` and `server/controllers/posLicenceAdminController.js` expose only isolated draft-administration API handlers for tests and future review. The router is not mounted from `server.js`, `server/server.js`, `server/routes/index.js`, or any existing production router.

Available routes when mounted in an isolated app:

- `GET /packages`
- `POST /packages`
- `GET /packages/:packageId`
- `PATCH /packages/:packageId`
- `GET /packages/:packageId/readiness`
- `GET /licences`
- `POST /licences`
- `GET /licences/:licenceId`
- `PATCH /licences/:licenceId`
- `GET /licences/:licenceId/readiness`

There are no deletion, publication, activation-code, signing, renewal, suspension, lifecycle-transition, or UI endpoints.

The router uses the real `verifyToken` middleware and `requireLicencePermission`. Read and readiness handlers require `licences:view`; mutations require `licences:manage`. Cookie-authenticated unsafe methods require the existing CSRF cookie/header match enforced by `verifyToken`.

List endpoints accept only allowlisted scalar filters, stable sorting, and bounded pagination. MongoDB operators, arbitrary filter objects, malformed IDs, and malformed `expectedVersion` values are rejected before service calls.

Readiness responses mean configuration readiness only. They do not imply production signing keys, public-key distribution, deployment, activation endpoints, renewal endpoints, or POS runtime activation are ready.

Before any future production mount:

- explicitly provision and verify POS collections/indexes
- verify admin access control and CSRF behavior in the target environment
- run a deployment review for route placement and rate limiting
- run existing website and business-system smoke checks
- prepare a bounded rollback plan that can remove the route mount without touching POS data

## Part 52 Activation-Code Issuance Service

`server/services/posActivationCodeAdminService.js` provides isolated server-side service functions only:

- `issueActivationCode(actor, licenceId, { expiresAt, maxRedemptions })`
- `listActivationCodes(actor, options)`
- `revokeUnusedActivationCode(actor, activationCodeId, input)`

These services are not mounted from production startup, routes, or UI. They do not add public redemption, signing, renewal, installation binding, lifecycle transitions, or activation-code UI.

Activation-code issuance requires the existing trusted administrator identity and `licences:manage`. Listing requires `licences:view`. Future route handlers must pass only the server-resolved `req.user` after `verifyToken`; request-body actor IDs, roles, permissions, codes, hashes, credentials, and audit actors are rejected.

The current lifecycle uses the existing `active` licence state as the administrative approval state. An `active` POS licence means issuance-eligible after admin approval; it does not mean a POS installation exists, a signed licence was delivered, an activation code was redeemed, or payment was received. Activation-code issuance also requires the referenced package to be published as `active`.

Activation codes use this format:

- generated with `crypto.randomBytes(16)` for exactly 128 bits of randomness
- encoded as lowercase hexadecimal with the literal prefix `posac_`
- full format: `posac_` plus 32 lowercase hex characters
- normalization for future lookup: trim surrounding whitespace and lowercase
- digest storage: `sha256:v1:` plus SHA-256 hex over `automatex-pos-activation-code:v1:` and the normalized code

The plaintext code is returned exactly once from successful issuance after the transaction commits. The database stores only the digest in `codeHash`, which is `select: false`; list and metadata serializers never include plaintext or digest values. Audit records contain allowlisted metadata only and never include raw codes or hashes.

Issuance requires explicit `expiresAt` and `maxRedemptions`. There are no commercial defaults. The code expiry must be in the future and must not exceed the licence expiry. Activation-code issuance does not change licence validity, support expiry, payment status, package contents, redemption enforcement, or installation limits.

Issuance uses a MongoDB transaction for the activation-code record and issuance audit record. A usable code must not be committed without its audit. Part 52 transaction verification is opt-in and requires a disposable local MongoDB replica set:

`AUTOMATEX_POS_ACTIVATION_CODE_TX=1 node --test test/api/pos-activation-code-mongodb-transaction.test.js`

There is a lost-response case: a transaction may commit even if the caller never receives the plaintext response. Because plaintext is not stored and the digest cannot recover it, the operational recovery path is to revoke the unused code and issue a new one. This service intentionally does not implement recoverable plaintext storage.

Unused-code revocation uses a conditional update on `_id`, `status: "active"`, and `redeemedCount: 0`, and writes a revoke audit record in the same transaction. Already redeemed codes cannot be revoked as unused. Future redemption must coordinate atomically with revocation and licence-state changes so redemption, revocation, expiry, and lifecycle transitions cannot race into contradictory states.

## Part 53 Package Publication And Licence Approval

`server/services/posLicenceLifecycleService.js` adds isolated lifecycle transition services only:

- `publishDraftPackage(actor, packageId, { expectedVersion, reason })`
- `approveDraftLicence(actor, licenceId, { expectedVersion, reason })`

These services are not mounted from production startup, production routes, or UI. They do not add suspension, expiry automation, package retirement, reverse transitions, activation codes, installation binding, signing, renewal credentials, licence issue records, or POS delivery.

The lifecycle transitions use existing states:

- package `draft` -> package `active`
- licence `draft` -> licence `active`

For packages, `active` means published and usable as an immutable package definition. Future changes require a new package version/record; Part 53 does not implement that versioning workflow.

For licences, `active` means administratively approved and eligible for future issuance. It does not mean a POS installation exists, a signed licence was generated or delivered, an activation code was redeemed, support is current, or payment was received. Payment status and support expiry remain separate from licence validity.

Both transitions require trusted admin identity with `licences:manage`. Transition input is limited to `expectedVersion` and an optional bounded `reason`. Readiness results, actor fields, permission fields, dates, modules, package contents, payment values, and lifecycle status cannot be supplied by callers.

Package publication revalidates persisted package configuration under the published state and rejects incomplete/stale/non-draft records. Published packages are protected from existing draft update services by the shared conditional `status: "draft"` and `__v` write path.

Licence approval revalidates the persisted licence and references:

- current draft state and matching `expectedVersion`
- existing client account with role `client`
- existing POS project belonging to that client
- published active package
- module and update-channel selection allowed by the package
- explicit unexpired `licenceExpiry`
- all existing issuable policy conditions

There is no licence-level installation limit field in the current data model, so Part 53 does not invent one or validate a commercial default. Activation-code `maxRedemptions` remains explicit at activation-code issuance time.

Publication/approval and their audit records commit in one MongoDB transaction. Audit failure rolls back the lifecycle transition. The transaction tests use a disposable local MongoDB replica set and are opt-in:

`AUTOMATEX_POS_LIFECYCLE_TX=1 node --test test/api/pos-licence-lifecycle-mongodb-transaction.test.js`

The transaction tests demonstrate that concurrent publish/publish, approve/approve, publish/edit, and approve/edit attempts cannot silently overwrite each other when they go through these services. This does not protect against future direct database edits or unreviewed write paths.

## Part 54 Local-Only Lifecycle And Activation-Code Administration

Part 54 exposes the Part 52-53 services only through the isolated POS admin router and local UI harness. The router remains unmounted from production startup and is mounted only by tests or `tools/pos-licence-admin-ui/harness.js`.

Additional local router endpoints:

- `POST /packages/:packageId/publish`
- `POST /licences/:licenceId/approve`
- `GET /licences/:licenceId/activation-codes`
- `POST /licences/:licenceId/activation-codes`
- `POST /activation-codes/:activationCodeId/revoke-unused`

Publication, approval, issuance and revocation require trusted admin identity with `licences:manage`; activation-code metadata listing requires `licences:view`. Cookie-authenticated unsafe methods still require the existing CSRF cookie/header match. Request bodies are strictly allowlisted and use persisted records as the source of lifecycle, module, channel and date policy.

Sensitive lifecycle and activation-code responses set `Cache-Control: no-store`. Activation-code plaintext is returned only once after a successful committed issuance response. List responses, audit records and ordinary queries must not expose plaintext or `codeHash`.

The local UI displays this notice: `Local test environment - production activation is not connected.` It provides package publication, licence approval, explicit activation-code expiry/redemption-limit issuance, sanitized metadata listing and unused-code revocation. It does not provide signing, redemption, renewal, suspension or installation-management controls.

If the issuance response is uncertain, the admin must inspect metadata, revoke an unused code if one exists, and issue a replacement. Stored digests cannot recover plaintext and this foundation intentionally does not store recoverable plaintext.

The local router action limiter is an in-memory `express-rate-limit` instance scoped to POS licensing action routes. It does not prove distributed production rate limiting. A future production mount still requires explicit collection/index provisioning, deployment review, admin/CSRF verification, website smoke checks and a bounded rollback plan.

## Part 55 Signing Compatibility Foundation

`server/utils/posLicenceSigning.js` adds server-only helpers for POS Standard signed-payload construction and Ed25519 signing:

- `buildStandardSignedLicencePayload({ licence, posPackage, installation, issuedAt, offlineValidUntil })`
- `signStandardLicencePayload(unsignedPayload, keyProvider)`
- `buildAndSignStandardLicencePayload(records, keyProvider)`

These helpers are not imported by production startup, production routes, controllers, public assets, or the local admin UI. They do not create `PosLicenceIssue` records, redeem activation codes, issue renewal credentials, expose signing endpoints, or configure production signing keys.

The signed payload is limited to the actual POS Standard activation response contract:

- `schemaVersion: 1`
- `clientId`
- `installationId`
- `edition: "standard"`
- `licenceStatus: "active"`
- `licenceExpiry`
- `enabledModules`
- `updateChannel`
- `supportExpiry`
- `issuedAt`
- `offlineValidUntil`
- `signature`

Internal key identifiers remain outside the signed POS response contract. The signature is base64-encoded Ed25519 over UTF-8 encoded canonical JSON from the POS verifier contract: remove `signature`, sort object keys recursively, preserve array order, and JSON-encode primitives exactly.

Payload construction requires an approved active licence, a published active Standard package, a signable installation bound to that licence, entitled modules allowed by the package, and explicit `issuedAt` plus `offlineValidUntil`. `offlineValidUntil` must be after `issuedAt` and no later than `licenceExpiry`; signing never extends `licenceExpiry`.

The signing helper uses a narrow `keyProvider.getPrivateKey()` boundary. Missing key providers, missing keys, invalid keys, or non-Ed25519 private keys fail closed. There is no built-in development key, fallback key, production provider, or persistent key generation.

Compatibility tests load the actual POS Standard source from:

`/Users/robertericsson/AutomateX/Systems/AutomateX POS Systems/POS-Standard Original/app.js`

The test creates an isolated temporary copy and injects an ephemeral public JWK only at `STANDARD_PRODUCTION_LICENCE_PUBLIC_KEY_JWK`, which is the POS trust-configuration boundary. It does not modify the real POS source or monkey-patch the verifier. Ephemeral private keys stay in memory and are not written to source, fixtures, logs, or artifacts.

The Part 55 tests verify the Company System-generated payload through the real POS cryptographic verifier and `requestStandardPosActivation` response path. They also verify rejection for altered modules, dates, client ID, installation ID, signature, wrong public key, wrong destination installation, expired licence, expired offline window in both online and offline status checks, missing/malformed/extra fields, array-order changes, safe non-ASCII identifiers, missing signing key, draft/ineligible records, and invalid offline windows.

Future redemption must run in a transaction that validates the activation code, licence, package, installation binding, destination device identity, expiry gates, replay/idempotency state, and audit/issue persistence before signing. Signing failures must prevent successful activation. Retries need a persisted issuance/idempotency design so a signed response can be retried safely without creating duplicate issue records or contradictory installation state. These tests prove payload and POS verifier compatibility only; they do not prove production secret management or key distribution.

## Part 56 Activation Redemption Transaction

`server/services/posActivationRedemptionService.js` adds an isolated internal service for POS Standard activation-code redemption:

- `createPosActivationRedemptionService(options)`
- `createDefaultRepositories()`
- `normalizeActivationRequest(requestPayload)`

The service is not mounted from production startup, routers, controllers, public assets, or the local admin UI. It is intended for a future POS machine activation endpoint only. It is not an Owner/Admin management API and it does not create renewal credentials, renewal responses, arbitrary signing endpoints, admin controls, or production key configuration.

The accepted activation request fields are exactly the fields generated by the current POS Standard source:

- `schemaVersion`
- `activationCode`
- `edition`
- `appVersion`
- `providerConfigVersion`
- `deviceInstallationId`
- `setupStatus`
- `runtime`

Request normalization rejects unknown fields, protected actor/permission fields, internal IDs, credential/hash fields, arbitrary filter objects, MongoDB operators, malformed activation codes, non-Standard editions, and malformed installation identifiers. `deviceInstallationId` is treated only as the POS installation binding identifier; it is not proof of hardware identity and must not be reused as a renewal credential.

Part 56 adds explicit licence policy fields required before redemption:

- `offlineValidUntil`
- `maxInstallations`
- internal `activationCount`

There are no commercial defaults. Existing approved licences with missing `offlineValidUntil` or `maxInstallations` remain ineligible for redemption until an authorized administration workflow explicitly sets those values. `offlineValidUntil` must be in the future and must not exceed `licenceExpiry`; redemption never extends `licenceExpiry`.

The transaction coordinates these records:

- conditional activation-code consumption
- conditional licence activation-count reservation
- installation creation/binding
- signed licence issue persistence
- installation last-issue reference update
- allowlisted redemption audit record

Installation limits are enforced through a shared conditional licence write on state, version, `activationCount`, `maxInstallations`, `licenceExpiry`, and `offlineValidUntil`. The service does not rely on an unprotected count-then-insert check. Activation-code consumption uses a conditional update on status, expiry, and redemption count, which conflicts with unused-code revocation.

`PosLicenceIssue` now stores `activationCodeId` and a `signedPayload` selected out by default. The stored signed payload is the non-secret activation response needed for safe lost-response retry. A payload digest alone cannot reproduce the exact POS response.

The current POS request has no idempotency key. Retry identity is therefore limited to the normalized activation code plus the licence-bound `deviceInstallationId`. For the same code and same device, a retry of a committed activation returns the exact stored signed response only while the activation code remains usable and the licence/package/offline validity checks still permit it. The retry path does not consume another redemption, create another installation, create another issue, create another audit-success event, or perform renewal. If the stored response or relevant validity gates have expired, retry is rejected and must not generate a fresh response.

Signing or audit failure rolls back the entire redemption transaction. The signed response is returned only after commit. Plaintext activation codes are never stored in redemption records, issue records, installation records, audit metadata, or logs.

Part 56 transaction and POS compatibility verification is opt-in and requires a disposable local MongoDB replica set plus ephemeral in-memory signing keys:

`AUTOMATEX_POS_REDEMPTION_TX=1 node --test test/api/pos-activation-redemption-mongodb-transaction.test.js`

The test injects an ephemeral public key only into a temporary copy of the actual POS source at the production trust-configuration boundary. The real POS source and its `STANDARD_PRODUCTION_LICENCE_PUBLIC_KEY_JWK = null` setting remain unchanged.

Future production work still requires a reviewed POS activation HTTP endpoint, explicit endpoint rate limiting, production index provisioning, production signing-key storage and rotation design, public-key distribution, transaction-capable MongoDB deployment verification, persisted issuance idempotency review, and a separate authenticated renewal contract. Activation cannot accept extra renewal credential fields until the POS/server contract is changed and reviewed.

## Part 57 Machine Activation HTTP Endpoint

`server/routes/posActivation.js` and `server/controllers/posActivationController.js` add an isolated machine activation endpoint router only. The route is:

`POST /standard/activate`

The router is not mounted from production startup, production routers, public website pages, client/staff dashboards, the Owner/Admin POS Control UI, or the local admin-management UI. It is mounted only by isolated tests or future reviewed machine-endpoint harnesses.

This endpoint is separate from Owner/Admin POS Control. Company System login sessions, admin roles, staff roles, client roles, cookies, bearer tokens, and UI visibility do not authorize activation. The activation code is the credential for this narrow operation, and `deviceInstallationId` is only the installation binding identifier. It is not a renewal credential and is not proof of hardware identity.

The endpoint accepts only the exact POS Standard activation request schema generated by the current POS helper:

- `schemaVersion`
- `activationCode`
- `edition`
- `appVersion`
- `providerConfigVersion`
- `deviceInstallationId`
- `setupStatus`
- `runtime`

On success it returns the exact signed POS Standard activation response payload with no wrapper and no extra fields. There are no renewal, installation-listing, admin-management, lifecycle-transition, arbitrary-signing, or suspension endpoints.

HTTP protections are scoped to this router:

- JSON-only requests
- small explicit body limit
- no activation codes in URLs or query strings
- unknown/protected/operator fields rejected by the Part 56 service
- endpoint-local in-memory rate limit
- `Cache-Control: no-store` on success and error responses
- generic sanitized activation-denied errors for invalid, expired, revoked, exhausted, or ineligible credentials where practical
- retryable sanitized `503` errors for service/database/signing failures

The router does not log request bodies, plaintext activation codes, signatures, signed responses, stack traces, licence IDs, client IDs, or installation details.

The actual POS helper requires an HTTPS activation endpoint, sends `Accept: application/json` and `Content-Type: application/json`, and rejects non-2xx responses or any response shape outside the exact signed-payload field set. Browser/Tauri CORS origins still require a production decision. The local tests allow only an explicit test origin. CORS is not authentication and must not replace activation-code validation. File/null origins or Tauri-specific origins must be reviewed before production exposure rather than broadly allowing every origin.

The local in-memory limiter proves only the local router behavior. It does not prove distributed production rate limiting.

Part 57 network, transaction, and POS compatibility verification is opt-in:

`AUTOMATEX_POS_ACTIVATION_ROUTER_INTEGRATION=1 node --test test/api/pos-activation-router.test.js`

The test uses a disposable local replica set, local-only Express app, ephemeral in-memory signing keys, and a temporary copy of the actual POS source with the ephemeral public key injected only at the existing production public-key trust boundary. The real POS source and its production public key remain unchanged.

Future production work still requires a reviewed route mount, HTTPS endpoint placement, explicit browser/Tauri origin allowlist, distributed rate limiting, production signing-key provider, public-key distribution, transaction-capable MongoDB verification, production index provisioning, deployment review, rollback plan, and a separate authenticated renewal contract.

## Part 59 Renewal-Credential Bootstrap Foundation

`server/utils/posRenewalCredentialToken.js` defines the reviewed renewal-credential format and digest representation for future POS-side generation:

- raw credential format: `posrc_` plus 64 lowercase hexadecimal characters
- raw credential entropy: 32 cryptographically random bytes
- normalization: trim surrounding whitespace and lowercase
- server digest format: `sha256:v1:` plus SHA-256 hex over `automatex-pos-renewal-credential:v1:` and the normalized raw credential

The server stores only the digest. A digest is not itself a valid renewal credential and cannot recover the raw credential. Part 59 tests generate ephemeral client-side credentials only; there is no Company System production credential generator, POS storage implementation, or activation schema-v1 change in this part.

`server/services/posRenewalCredentialBootstrapService.js` adds an isolated internal service:

- `createPosRenewalCredentialBootstrapService(options)`
- `normalizeBootstrapRequest(requestPayload)`

The accepted bootstrap request fields are the Part 58 proposed fields:

- `schemaVersion`
- `edition`
- `activationCode`
- `deviceInstallationId`
- `signedLicenceSignature`
- `renewalCredentialDigest`

Unknown fields, protected actor/permission fields, internal IDs, raw credentials, hashes other than `renewalCredentialDigest`, request-body signatures outside the committed activation signature check, arbitrary filter objects, and MongoDB operators are rejected. Company System admin, staff, employee, client, or anonymous sessions do not authorize bootstrap. The bootstrap service is a machine-credential boundary: the activation code plus exact committed activation context are required.

Bootstrap eligibility requires:

- a valid normalized activation code digest
- an existing activation-code record that is not expired or explicitly revoked
- an existing committed activation issue linked to that exact activation-code record
- an active installation whose `deviceInstallationId` matches the request
- the request signature matching the committed issue's signed POS response signature
- an approved active licence and published active package that still pass POS policy validation
- current `licenceExpiry` and `offlineValidUntil`
- explicit `maxInstallations` policy, even though bootstrap does not consume installation capacity

The signature is public data and is not accepted as a secret. It only binds the request to the previously committed activation response when the valid activation code and installation match too. A fully redeemed one-use code can bootstrap only the installation from its own committed activation; it cannot be reused for a different device or a new activation.

First binding runs in a MongoDB transaction. It conditionally writes the activation-code record version to coordinate with unused-code revocation, conditionally binds `renewalCredentialHash`, sets `renewalCredentialVersion` to `1`, sets `renewalCredentialBoundAt`, and writes one allowlisted audit record. Audit failure rolls back the credential binding. The service does not increment redemption counts, consume installation capacity, create installations, create licence issues, sign payloads, renew licences, or expose HTTP endpoints.

Retry behavior is deliberately narrow. For the same installation and same digest, a repeated request returns the same acknowledgement and creates no duplicate binding or audit record. For a different digest, the service rejects without changing the existing credential. Recovery, overwrite, rotation, reset, and credential bootstrap windows are not implemented. If the POS loses the raw credential or misses the bootstrap window, the server cannot recover it from the digest; a future authorized recovery process must revoke/reset through a separately reviewed Owner/Admin workflow.

Ordinary installation serialization includes `renewalCredentialVersion` and `renewalCredentialBoundAt`, but excludes `renewalCredentialHash`. Audit records must not contain the raw activation code, renewal digest, raw credential, request body, signature, or signed payload.

Part 59 transaction verification is opt-in and requires a disposable local MongoDB replica set:

`AUTOMATEX_POS_RENEWAL_BOOTSTRAP_TX=1 node --test test/api/pos-renewal-credential-bootstrap-mongodb-transaction.test.js`

The test uses real Mongoose models and the real activation redemption service to create a committed activation before bootstrap. It provisions collections and indexes only in the disposable test database, then drops only the exact test collections and removes only the exact temporary dbpath.

Future work still requires a POS-side credential generation/storage implementation, a reviewed HTTP bootstrap or activation-response-envelope migration, recovery/reset and rotation policy, an authenticated renewal endpoint, production key/provider configuration, production transport/origin decisions, distributed rate limiting, and production database/index provisioning. POS Control management remains Owner/Admin-only and separate from machine activation/renewal APIs.

## Part 60 Authenticated Renewal Service

`server/services/posLicenceRenewalService.js` adds an isolated internal renewal service only:

- `createPosLicenceRenewalService(options)`
- `normalizeRenewalRequest(requestPayload)`

The accepted request contract is exact:

- `schemaVersion: 1`
- `edition: "standard"`
- `deviceInstallationId`
- `renewalCredential`
- `lastSignature`

There is no HTTP endpoint, route mount, UI, POS source change, activation schema-v1 change, credential recovery, or credential rotation in Part 60. The service returns the existing bare signed POS Standard licence payload and does not wrap it with extra fields.

The renewal credential is the machine credential for this operation. The service validates the raw Part 59 credential format, computes the purpose-separated digest server-side, and compares that digest against `PosInstallation.renewalCredentialHash` with a timing-safe comparison. Supplying the digest as `renewalCredential` is rejected. Installation ID, `lastSignature`, Company System cookies, Owner/Admin sessions, staff sessions, client sessions, or UI access never substitute for the renewal credential.

Authentication succeeds only for an active installation with a bound credential version. After authentication, renewal still requires an approved active licence, a published active package, POS module/channel policy consistency, and a still-valid underlying `licenceExpiry`.

Part 60 adds optional `PosLicence.renewalWindowDurationMinutes`. It is validated when set, but remains optional for existing activation-compatible records. Renewal requires it explicitly; missing or invalid renewal-window policy returns an internal configuration failure. Renewal does not use historical `offlineValidUntil` as a rolling duration.

Renewal calculates:

`new offlineValidUntil = min(server issuedAt + renewalWindowDurationMinutes, licenceExpiry)`

An expired previous offline window does not by itself block renewal. An expired underlying licence does block renewal. Renewal never extends `licenceExpiry`, support expiry, paid service duration, activation-code redemption counts, installation capacity, or `activationCount`.

Idempotency identity is the authenticated installation, the bound credential version, and a purpose-separated hash of `lastSignature`. `lastSignature` must either:

- match the latest committed issue for a new renewal, or
- match a predecessor for an already committed renewal so the exact signed response can be replayed.

This prevents arbitrary historical signatures from creating unlimited branch chains. A repeated identical request returns the exact stored signed response while that committed response remains valid and current licence policy still permits it. If the stored replay response has expired, the service returns a stale stored-response condition and does not issue another renewal under the same request identity.

`PosLicenceIssue` now records renewal metadata:

- `predecessorSignatureHash`
- `renewalCredentialVersion`
- `signedPayload` selected out by default

The transaction coordinates credential eligibility, latest-issue conditional update, renewal issue creation, installation `lastIssueId` update, and allowlisted audit logging. Signing or audit failure rolls back all renewal writes. The signed response is returned only after commit.

Lost long-term recovery remains unresolved by design. The server cannot recover the raw renewal credential from its digest. If the POS loses the credential or a stored replay response has expired, recovery requires a separately reviewed Owner/Admin recovery or reactivation process. Future rotation/revocation must coordinate with renewal transactions so credential state and latest-issue state cannot race into contradictory outcomes.

Part 60 transaction and POS compatibility verification is opt-in and requires a disposable local MongoDB replica set plus ephemeral in-memory signing keys:

`AUTOMATEX_POS_RENEWAL_TX=1 node --test test/api/pos-licence-renewal-mongodb-transaction.test.js`

The test creates a committed activation and renewal bootstrap first, then exercises the real renewal service using actual Mongoose models. It injects an ephemeral public key only into a temporary copy of the actual POS source at the existing production public-key trust boundary. The real POS source, production public key, website startup, admin router, machine activation router, public assets, and local UI remain unchanged.

## Part 61 Machine Renewal HTTP Endpoint

`server/routes/posActivation.js` and `server/controllers/posActivationController.js` now expose a second unmounted machine endpoint when the machine router is mounted in an isolated test app:

`POST /standard/renew`

The route is not mounted from production startup, production routers, public website pages, staff/client dashboards, Owner/Admin POS Control, or the local admin UI. There is still no bootstrap HTTP endpoint, credential recovery endpoint, credential rotation endpoint, admin action, installation-management action, or arbitrary signing action.

The renewal endpoint accepts only:

- `schemaVersion`
- `edition`
- `deviceInstallationId`
- `renewalCredential`
- `lastSignature`

It returns the existing bare signed POS Standard licence payload. It delegates authentication, policy validation, signing, transactions, idempotency and latest-issue rules to `posLicenceRenewalService`; the router does not duplicate those business rules.

The renewal credential is the only machine authentication secret for this endpoint. Company System Owner/Admin, staff, employee, manager, client cookies or bearer tokens do not substitute for it. The endpoint does not run Company System login middleware and is separate from cookie-authenticated POS Control/admin routes and CSRF logic. Installation ID and `lastSignature` remain binding/idempotency inputs, not authenticators.

HTTP protections are route-local:

- JSON-only requests
- small explicit body limit
- query strings rejected
- strict service field allowlist and operator rejection
- `Cache-Control: no-store` on success and every error
- endpoint-specific in-memory rate limiter
- sanitized errors without stack traces, internal IDs, credentials, raw signatures or signed responses

Wrong credential, wrong device, wrong signature, expired licence and ineligible records are mapped to a generic renewal denial where practical. Missing renewal-window configuration, signing failure, database failure and audit failure are reported as sanitized retryable service failures. Expired stored replay responses return a sanitized stale-request condition and do not issue another renewal under the same request identity.

The local test CORS policy allows only the explicit local test origin. CORS is a transport policy and not authentication. Production still requires a reviewed HTTPS endpoint and explicit decisions for browser-hosted POS origins, Tauri origins, file/null origins and preflight handling. The implementation does not alter global trust-proxy settings or shared website rate limiters.

Part 61 network verification is opt-in:

`AUTOMATEX_POS_RENEWAL_ROUTER_INTEGRATION=1 node --test test/api/pos-renewal-router.test.js`

The test uses a disposable local MongoDB replica set, a local-only Express app, real activation/bootstrap/renewal service paths, ephemeral in-memory signing keys, and a temporary POS source copy with only the ephemeral public key injected at the existing trust boundary. The real POS source and production public key remain unchanged.

## Part 62 Renewal-Credential Bootstrap HTTP Endpoint

`server/routes/posActivation.js` and `server/controllers/posActivationController.js` now expose a third unmounted machine endpoint when the machine router is mounted in an isolated local test app:

`POST /standard/renewal-credentials/bootstrap`

The route is not mounted from production startup, production routers, public website pages, staff/client dashboards, Owner/Admin POS Control, or the local admin UI. It does not add rotation, reset, recovery, admin actions, installation-management actions, renewal signing, activation-code redemption, or arbitrary signing.

The bootstrap endpoint accepts exactly:

- `schemaVersion`
- `edition`
- `activationCode`
- `deviceInstallationId`
- `signedLicenceSignature`
- `renewalCredentialDigest`

It returns exactly:

- `schemaVersion`
- `status`
- `installationId`
- `credentialVersion`

The endpoint delegates eligibility, binding, idempotency, transaction, revocation coordination and audit behavior to `posRenewalCredentialBootstrapService`. It never accepts or returns the raw renewal credential. The activation code plus exact committed activation issue/device/signature relationship authenticates bootstrap. Company System cookies or bearer tokens do not substitute for machine credentials; installation ID or public signature alone is not enough.

HTTP protections are route-local and mirror the other machine routes:

- JSON-only requests
- small explicit body limit
- query strings rejected
- strict service field allowlist and operator rejection
- `Cache-Control: no-store` on success and every error
- endpoint-specific in-memory rate limiter
- narrow local-test CORS
- sanitized, non-enumerating errors

The endpoint must not log request bodies, plaintext activation codes, renewal credential digests, signatures, internal IDs, stack traces or signed payloads. Local in-memory rate limiting proves only isolated local behavior; production still needs distributed rate limiting. Local CORS allows only the explicit test origin. Production still requires HTTPS and explicit browser/Tauri/file/null origin decisions; CORS is not authentication.

Part 62 network verification is opt-in:

`AUTOMATEX_POS_RENEWAL_BOOTSTRAP_ROUTER_INTEGRATION=1 node --test test/api/pos-renewal-bootstrap-router.test.js`

The test uses a disposable local MongoDB replica set, local-only Express app, real HTTP activation followed by real HTTP bootstrap, real Mongoose models, ephemeral in-memory signing keys and ephemeral test credentials. It provisions collections and indexes only in the disposable test database, then drops only the exact test collections and removes only the exact temporary dbpath. The real POS source/public-key trust boundary is checked read-only and remains unchanged.

Future work still requires POS-side credential generation/storage, a reviewed production route mount, HTTPS endpoint placement, explicit origin policy, distributed rate limiting, production key/provider configuration, transaction-capable MongoDB verification in the deployment environment, production index provisioning, recovery/reset and rotation workflows, and a deployment/rollback review.
