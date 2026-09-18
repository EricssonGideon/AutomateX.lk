# POS Licensing Transport and Origin Contract

## Scope

Part 78E prepares HTTPS, hostname, proxy, forwarded-header, and CORS controls for POS licensing. The guards and policies are not mounted because production licensing and its routes remain inactive.

## HTTPS and approved hosts

Production and staging each require an approved non-local DNS hostname when that environment is being validated. The opposite environment's hostname is optional, but is validated when present and the two names must differ when both are configured. The current environment's machine API origin must be exactly `https://<approved-hostname>` with no credentials, wildcard, path, query, or fragment. HTTP and loopback endpoints fail configuration. Request guards reject insecure and unexpected-host traffic without redirecting it.

## Reverse proxy model

`POS_LICENSING_PROXY_TRUST_MODE` supports only:

- `direct`: Node receives TLS directly, Express proxy trust is disabled, and forwarded headers are ignored.
- `cidr`: TLS terminates at an approved proxy whose immediate socket address is within `POS_LICENSING_TRUSTED_PROXY_CIDRS`.
- `vercel`: available only when `VERCEL=1` and the Vercel runtime matches the licensing environment (`preview` for staging, `production` for production). Express proxy trust remains disabled; the Vercel-controlled HTTPS forwarding signal is accepted only in that verified runtime, and forwarded host must agree with `Host` before exact approved-host validation.

Empty, `unresolved`, numeric-hop, arbitrary, and universal proxy trust fail production readiness. Vercel mode also fails outside Vercel or when Preview/Production does not match staging/production. The exact deployment CIDRs are intentionally not invented in this repository. Express defaults to no proxy trust instead of trusting one unspecified hop. Audit identity uses Express's trust-aware `req.ip`, never raw `X-Forwarded-For`.

For trusted CIDR peers, only one unambiguous `X-Forwarded-Proto: https` and one unambiguous forwarded host are accepted. In verified Vercel mode, only one unambiguous `X-Forwarded-Proto: https` is accepted and `X-Forwarded-Host` must equal `Host`. Untrusted forwarded protocol and host values have no effect.

## Origin policy matrix

| Surface | Browser origin rule | Credentials | Authorization |
| --- | --- | --- | --- |
| Public/general Company System API | Exact `ALLOWED_ORIGINS` plus same-origin behavior | Existing application policy | Route-specific |
| Owner/Admin POS Control | Environment-selected exact `POS_LICENSING_PRODUCTION_ADMIN_ORIGINS` or `POS_LICENSING_STAGING_ADMIN_ORIGINS`, disjoint across environments and also present in `ALLOWED_ORIGINS` | Allowed for cookie/CSRF flow | Trusted Admin role still mandatory |
| Staff/employee/client UI | General application origins only | Existing application policy | Cannot receive POS licence permissions |
| POS machine activation/bootstrap/renewal | Originless native requests only; `POS_LICENSING_MACHINE_ALLOWED_ORIGINS=none` | Disabled | Machine protocol validation |

Wildcard and arbitrary reflected origins are rejected. Wildcard plus credentials is explicitly invalid. CORS never grants a staff, employee, client, or public caller POS Control access.

## Readiness

Readiness emits only boolean checks and stable codes for HTTPS origin, approved hostname, environment hostname isolation, explicit proxy trust, application allowlist, no wildcard, POS Control origins, and disabled machine browser CORS. It does not emit configured hostnames, origins, CIDRs, or credentials.
