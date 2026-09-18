# POS Licensing Production Activation Checklist

This is the authoritative operator checklist after Parts 77–78F. Completing it does not itself authorize deployment or route mounting. Keep `POS_LICENSING_MODE=disabled` and `POS_LICENSING_ENABLED=false` until the final reviewed activation change.

## Hosting and transport

- [ ] Choose and approve the production hosting platform and region.
- [ ] Approve the production and staging machine API hostnames; confirm they are distinct.
- [ ] Confirm valid HTTPS certificates and TLS termination ownership.
- [ ] Decide whether Node receives TLS directly or through a reverse proxy.
- [ ] If proxied, approve the exact bounded proxy CIDRs and confirm the edge overwrites forwarded protocol, host, and client-IP headers.
- [ ] Configure distinct production and staging Company System/POS Control origins.
- [ ] Keep machine browser CORS disabled unless browser access receives a separate security review.

## Secrets and signing

- [ ] Choose the production secret manager or approved runtime-injection mechanism.
- [ ] Generate the final production Ed25519 signing key only inside the approved secret workflow.
- [ ] Store the private JWK only in the production server secret destination.
- [ ] Install and independently review the matching public-only JWK and approved key ID.
- [ ] Confirm staging and production secret identities, key IDs, and access policies remain separate.
- [ ] Run the repository secret scanner and resolve every finding.

## MongoDB and transactions

- [ ] Create the dedicated authenticated TLS production MongoDB database and least-privilege account.
- [ ] Confirm the database name and client/licensing data are production-only.
- [ ] Verify logical sessions and replica-set or mongos transaction topology.
- [ ] Run the safe transaction probe successfully.
- [ ] Review the provisioning dry run.
- [ ] Apply the approved idempotent collections/indexes in a separately authorized operation.
- [ ] Confirm audit/history collections have no TTL indexes.

## Distributed limiter and audit operations

- [ ] Select and approve a distributed limiter provider.
- [ ] Implement/review the provider adapter against the Part 78D contract.
- [ ] Inject the production-only backend URI and identity.
- [ ] Verify activation, bootstrap, and renewal namespaces are distinct.
- [ ] Verify adapter health from every production instance with no memory fallback.
- [ ] Approve audit ownership, monitoring, alerting, access, retention, and incident-response procedures.

## Staging and final gate

- [ ] Complete the same transport, secret, MongoDB, transaction, limiter, CORS, audit, and route-isolation checks in staging with staging-only data.
- [ ] Confirm the staging gate can only report staging eligibility and never production eligibility.
- [ ] Complete end-to-end staging validation without production clients, secrets, keys, databases, counters, or origins.
- [ ] Run `npm run check:pos-licensing-production` from the approved production environment.
- [ ] Review every individual safe check and require an overall eligible result.
- [ ] Obtain explicit security and operations approval for the enablement flag.
- [ ] Only after all prior items pass, approve a separate change that mounts the isolated machine and POS Control route groups.
- [ ] Verify the route-mount change retains HTTPS/host guards, scoped CORS, Admin authorization, transaction enforcement, distributed limiting, and audit logging.

## Current stop state

- Production keys have not been generated.
- MongoDB has not been provisioned.
- No distributed limiter provider is connected.
- Real hostnames and proxy CIDRs are not configured.
- The enablement flag remains false.
- POS licensing routes remain unmounted and inactive.
