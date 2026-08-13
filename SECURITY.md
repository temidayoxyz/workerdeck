# Security policy

WorkerDeck is a privileged control plane. Treat every installation as production infrastructure.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Email the repository owner with a clear
description, affected version, reproduction steps, and impact. Please allow a reasonable remediation
window before public disclosure.

## Security invariants

- Cloudflare and Git provider credentials are stored only as encrypted Worker secrets.
- Secret values are never persisted in D1, returned by APIs, or included in logs.
- Untrusted repository builds receive a dedicated Workers Scripts token and never receive the
  broader WorkerDeck control-plane token.
- GitHub App setup callbacks use an actor-bound, hashed, single-use state value with a ten-minute
  lifetime; installation access tokens are not persisted.
- Production authentication fails closed and validates Cloudflare Access JWT signatures and audience.
- Mutating browser requests require a same-origin `Origin` header.
- API request bodies are limited to 32 KB, and deployment creation requires replay-safe idempotency.
- Only one deployment may be active in an environment at a time.
- Repository builds execute in Cloudflare Workers Builds, outside the privileged control Worker.
- Infrastructure mutations are recorded in an append-only audit trail.
- WorkerDeck only mutates resources recorded in its ownership ledger.
- Analytics queries are account-scoped at Cloudflare but filtered to Worker names from WorkerDeck's
  ownership ledger before data is returned to the dashboard.
- D1 recovery verification is read-only; the destructive Time Travel restore endpoint is not exposed.
- Destructive actions require explicit confirmation and support dry-run discovery where practical.
