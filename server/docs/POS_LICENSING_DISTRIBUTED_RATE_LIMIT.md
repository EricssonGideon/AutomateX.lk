# POS Licensing Distributed Rate-Limit Contract

## Inactive preparation state

Part 78D prepares a provider-neutral distributed limiter for the activation, renewal-credential bootstrap, and renewal machine endpoints. It does not choose or connect a service, mount the machine routes, or activate production licensing.

## Server configuration

Production and any configured staging limiter require an injected backend name, store identity, base namespace, secret store URI, positive window, and positive endpoint-specific limits. Memory, local, in-process, missing, development, and test identities fail closed. Store identities and namespaces must explicitly identify exactly one secure environment:

- production example: `automatex-pos-production-distributed-v1` and `automatex:pos-licensing:production`;
- staging example: `automatex-pos-staging-distributed-v1` and `automatex:pos-licensing:staging`.

The store URI remains accessible only through the server-only secret provider. Readiness, errors, logs, and response payloads expose no URI or credential.

## Adapter interface

The future approved factory receives a contract containing `backend`, `distributed`, `environment`, `storeIdentity`, endpoint `namespace`, `windowMs`, endpoint `limit`, and the server-only `storeUri`. It must return a new adapter for each endpoint with matching safe metadata, `distributed: true`, `localKeys: false`, and these methods:

- `increment(key)` returning the hit count and reset time expected by `express-rate-limit`;
- `decrement(key)`;
- `resetKey(key)`;
- `healthCheck()` returning `{ healthy: true }` only after the shared backend is usable.

Optional `get`, `resetAll`, and `shutdown` methods are forwarded through the same sanitized boundary. An optional `init` must complete synchronously because `express-rate-limit` does not await it; asynchronous adapter initialization belongs in the factory/bootstrap step. Raw factory and adapter errors are never propagated.

## Counter and key isolation

The base namespace is expanded into three distinct namespaces: `:activation`, `:bootstrap`, and `:renewal`. Reusing one endpoint adapter object or mismatching its namespace is rejected.

Each counter key is the operation plus a SHA-256 digest of the normalized request IP identity. The raw IP is not retained in the key. Activation codes, renewal credentials, authorization headers, request bodies, and signing values are not inputs. Endpoint names are included in the key as defense in depth in addition to separate store namespaces.

## Failure and readiness behavior

Limiter middleware explicitly keeps `passOnStoreError` disabled. Adapter errors become `rate_limit_backend_unavailable`, and the existing machine router maps unexpected limiter failures to its generic retryable service-unavailable response. Production readiness requires valid distributed configuration, three distinct namespaces, three valid adapters, and successful health checks. Missing or unhealthy infrastructure never creates an in-memory fallback, so licensing stays inactive.
