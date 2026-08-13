# Threat model

## Protected assets

- Cloudflare API credentials and account authorization
- Application source metadata and private repository identifiers
- Worker scripts, versions, routes, and domains
- D1, KV, and R2 application data
- Deployment and audit history

## Primary threats and controls

| Threat                            | Control                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| Stolen browser session            | Cloudflare Access policy, short-lived signed assertions, audience validation            |
| Cross-site mutation               | Same-origin `Origin` enforcement on every mutating API request                          |
| Credential disclosure             | Worker secrets only; values never persisted or returned                                 |
| Over-privileged token             | Installer documents scoped permissions; connection endpoint verifies accessible account |
| Resource deletion outside scope   | Ownership ledger and explicit destructive confirmations                                 |
| Duplicate builds or retries       | Idempotency keys and durable operation records                                          |
| Partial deployment                | Staged source/build/version/traffic transaction with resumable state                    |
| Secret leakage in logs            | Structured allowlisted logging; provider response bodies are not logged                 |
| Cross-project analytics exposure  | GraphQL rows are filtered against WorkerDeck-owned Worker names                         |
| Accidental database overwrite     | Time Travel is verified read-only; restore endpoint is not exposed                      |
| Supply-chain compromise           | Lockfile, CI with `npm ci`, dependency audit, minimal package surface                   |
| Clickjacking or content injection | CSP, frame denial, MIME sniffing denial, restricted permissions policy                  |

## Non-goals

WorkerDeck does not make arbitrary applications compatible with Workers, provide isolation for untrusted
third-party code inside a shared account, or make a code rollback restore application data. Those require
separate runtime and data-recovery controls.
