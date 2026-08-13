# Architecture

WorkerDeck is split into boundaries that can be reviewed and tested independently.

```text
Browser
  `-- Dashboard (React, static assets)
       `-- /api/v1
            `-- Control plane (Hono Worker)
                 |-- D1 metadata and ownership ledger
                 |-- Cloudflare Access identity
                 `-- Cloudflare provider API
                      |-- Workers and versions
                      |-- Builds
                      |-- D1 / KV / R2
                      `-- Domains and routes
```

## Trust boundaries

The browser is untrusted. Every input is runtime-validated at the API boundary. Production identity
comes from a Cloudflare Access JWT whose issuer, audience, signature, and algorithm are validated.

The control Worker is privileged. Its Cloudflare API token exists only as an encrypted Worker secret.
The token is never stored in D1, returned to the dashboard, or written to application logs.

Cloudflare is the infrastructure provider and source of truth for deployed resources. WorkerDeck stores
an ownership record for every resource it creates. A resource without a matching ownership record is
never mutated or deleted implicitly.

## Deployment transaction

Deployments are modeled as provider-backed operations whose state is reconciled through the API:

```text
source verified -> build started -> version uploaded -> traffic promoted
```

Creation requires an idempotency key, only one release may be active per environment, and every
terminal transition is auditable. Cloudflare Workers Builds performs the untrusted repository build;
WorkerDeck never evaluates repository code inside its privileged control Worker. A failed transition
stops the operation and records remediation context. Code rollback will promote a previous Worker
version; it will not claim to roll back D1, KV, R2, or Durable Object data.

## Data model

- `projects`: repository and framework intent.
- `environments`: production, preview, and development runtime targets.
- `deployments`: immutable release attempts and provider identifiers.
- `managed_resources`: the ownership ledger.
- `operations`: resumable infrastructure state machines.
- `audit_events`: append-only records of privileged actions.
- `idempotency_keys`: duplicate mutation protection.
- `settings`: non-secret installation configuration.
