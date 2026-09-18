POS Licensing draft-management UI
=================================

This directory contains a local-only draft-management UI for the isolated POS
licensing foundation. It is not in `public/` and is not mounted by production
startup.

Local entry point:

```sh
node tools/pos-licence-admin-ui/harness.js
```

The harness binds to `127.0.0.1`, starts a disposable local MongoDB replica set,
mounts `server/routes/posLicenceAdmin` only inside that process, and seeds
test-local users/clients/projects. It does not load production database
configuration or credentials.

The UI supports draft package/licence editing, package publication, licence
approval, and local-only activation-code administration. Published packages are
immutable definitions. Approved licences are eligible for future activation.
Neither state means that a POS installation has been activated.

Activation-code plaintext is shown only once after a successful issuance
response. Metadata lists do not include plaintext or digests. If the browser
request outcome is uncertain, inspect metadata, revoke any unused code if
needed, then issue a replacement. Stored digests cannot recover plaintext.

The mounted local admin router uses an in-memory action rate limiter. That
demonstrates local request throttling only and is not evidence of distributed
production rate limiting.

Future production integration still needs a real, authorized client/project
lookup API. The selectors in this UI currently use only harness fixture
endpoints.
