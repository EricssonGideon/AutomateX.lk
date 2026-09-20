# POS Licensing MongoDB Contract

## Scope and stop state

Part 78C validates MongoDB configuration, connection safety, transaction readiness, and the existing provisioning definitions. It does not connect to or provision a live database. Licensing routes remain unmounted and production/staging licensing remains inactive.

## Production requirements

Production accepts only explicit `MONGO_URI`; `MONGODB_URI` is not a fallback. The URI must:

- use `mongodb+srv://`, or `mongodb://` with `tls=true`/`ssl=true`;
- contain non-empty URI username and password components;
- use a non-local host;
- identify exactly one database in its path;
- match `POS_LICENSING_DATABASE_NAME` exactly;
- not disable TLS, certificate/hostname validation, retryable reads, or retryable writes.

The explicit database name must contain distinct `pos` and `production`/`prod` markers. Reserved, local, development, test, staging, mock, generic, and ambiguous names fail closed.

## Staging isolation

Staging uses the same authenticated/TLS transport rules, but its database name must contain distinct `pos` and `staging` markers. Production/test/development/local/mock identities are rejected. `POS_LICENSING_SECRET_ENVIRONMENT=staging`, `POS_LICENSING_ENVIRONMENT=staging`, and `POS_LICENSING_CLIENT_SCOPE=staging-only` remain independent gates. No production URI or record inspection fallback exists.

Configuration proves separation by identity and database target. It does not inspect or copy live client/licensing records in Part 78C.

## Connection settings

All future staging/production POS connections use the shared safe option builder:

- explicit `dbName`;
- `bufferCommands=false`;
- `autoCreate=false` and `autoIndex=false`;
- 5-second server-selection timeout;
- 10-second connection timeout;
- pool range 0–20;
- retryable reads and writes enabled.

Connection errors are logged without URI/credential values. Production startup still refuses to listen when the connection or readiness gate fails.

## Transaction readiness

The read-only readiness probe performs MongoDB `hello`, verifies a positive logical-session timeout, requires a replica set (`setName`) or mongos (`isdbgrid`), starts a session, and performs one projected read inside `withTransaction`. The probe and all default POS write-service transactions use snapshot read concern, majority write concern, and primary read preference.

Logical-session, topology, session API, transaction API, or probe failure returns a safe reason code and keeps readiness false. There is no non-transactional downgrade.

## Provisioning safety

Model schemas retain `autoCreate=false` and `autoIndex=false`. The provisioning command is dry-run unless `--apply` and the separate confirmation value are both provided. Definitions use deterministic collection/index creation, tolerate an already-existing collection, retain required uniqueness constraints, and prohibit TTL indexes across the plan. No drop, rename, delete, or automatic migration operation exists.

For Part 78C, run only:

```sh
npm run provision:pos-licensing
```

Do not pass `--apply` until a later approved live provisioning step.

## Staging provisioning command

The staging command is separate from the existing production-oriented command. It reuses the reviewed seven-collection, 40-index plan and validates the complete staging licensing configuration before connecting. It accepts either verified Vercel Preview runtime identity or the explicit local execution value `POS_LICENSING_STAGING_PROVISION_EXECUTION=approved-local`. Production, ambiguous database identities, and other Vercel environments fail closed.

Local staging dry run:

```sh
POS_LICENSING_STAGING_PROVISION_EXECUTION=approved-local npm run provision:pos-licensing-staging
```

Reviewed local staging apply:

```sh
POS_LICENSING_STAGING_PROVISION_EXECUTION=approved-local POS_LICENSING_STAGING_PROVISION_CONFIRM=PROVISION_AUTOMATEX_POS_LICENSING_STAGING npm run provision:pos-licensing-staging -- --apply
```

Apply creates missing defined collections and indexes or checks the existing definitions through idempotent MongoDB operations. It does not drop collections or indexes, delete records, migrate data, or inspect unrelated collections.
