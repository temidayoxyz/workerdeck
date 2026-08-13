# Deployment operations

WorkerDeck uses Cloudflare Workers Builds for application compilation and deployment. Repository code
does not run in the WorkerDeck control plane.

## One-time Cloudflare setup

Cloudflare currently requires the account owner to authorize Cloudflare's GitHub App once before its
Builds API can connect repositories. WorkerDeck adds its own optional GitHub App for the in-dashboard
repository catalog. The WorkerDeck App needs repository **Metadata: Read** only; installation access
tokens are created on demand, expire at GitHub, and are never persisted.

Connected imports perform Cloudflare's documented setup sequence:

1. Revalidate the selected repository against the user's active GitHub App installation.
2. Create a repository connection in Cloudflare Builds.
3. Upload a minimal 503 bootstrap Worker to establish the immutable Worker tag.
4. Enable its system and preview domains.
5. Create production and preview build triggers with a dedicated build token.
6. Store only Worker tags, trigger IDs, installation IDs, and ownership metadata in D1.

The API compensates by deleting created triggers and the bootstrap Worker if the import cannot be
committed to WorkerDeck's ownership ledger. It refuses to adopt a pre-existing Worker with the same
name.

## Release lifecycle

1. The dashboard submits a production deployment with a unique idempotency key.
2. The API enforces one active deployment per environment.
3. WorkerDeck triggers the matching Cloudflare Build by branch and optional commit SHA.
4. The dashboard periodically asks the API to reconcile the build.
5. On success, WorkerDeck records the active 100% Worker version. Failures and cancellations become
   terminal release states and audit events.

## Managed data resources

The Resources screen can provision D1 databases, KV namespaces, and R2 buckets for a selected
production environment. The API accepts only these allowlisted kinds, reserves an idempotency key
before calling Cloudflare, and records every successful resource in the ownership ledger. If the
ledger write fails after Cloudflare creates the resource, WorkerDeck attempts a compensating delete
and emits a structured operator error if compensation also fails.

WorkerDeck does not adopt pre-existing resources and does not expose deletion until a resource-aware
backup and confirmation flow exists.

## Custom domains

Project domains use Cloudflare's account-level Workers Custom Domains API. Before attachment,
WorkerDeck checks all account domains for hostname conflicts. After Cloudflare creates the DNS record
and certificate, WorkerDeck writes the returned immutable domain ID to its ownership ledger. A failed
ledger write triggers a compensating detach. Domain deletion remains hidden until the associated
certificate cleanup and confirmation flow can be represented honestly.

## Rollback

Any completed deployment with a recorded Worker version can be promoted back to 100% traffic after an
explicit browser confirmation. The API requires the literal `ROLLBACK` confirmation and an
idempotency key, promotes the exact version, then writes a new immutable rollback deployment and audit
event. Rollback changes Worker code only; it does not reverse D1, KV, R2, or Durable Object data.

Cloudflare's Workers Builds API requires a user-scoped API token; account-owned API tokens are not
currently supported by that API. The control-plane token is stored as `CLOUDFLARE_API_TOKEN`. A
separate `CLOUDFLARE_BUILD_TOKEN`, scoped for application deployment, is registered with Workers
Builds and passed to repository builds. Its token ID is non-secret configuration; its value is always
a Worker secret.

## Environment variables and secrets

- Build variables and masked build secrets are scoped to a Workers Builds trigger.
- Runtime secrets are written through the Worker secret endpoint.
- Secret values are never stored in D1, included in audit metadata, or returned to the dashboard.
- Runtime plain-text bindings are intentionally not edited through the secret screen because an
  incomplete binding update can replace unrelated Worker configuration. They remain in the
  repository's Wrangler configuration until a binding-aware reconciliation engine lands.

## Observability and usage

The global Observability and Usage screens query Cloudflare's account-scoped
`workersInvocationsAdaptive` GraphQL dataset for only the Worker names in WorkerDeck's ownership
ledger. Request, error, subrequest, and CPU quantile values are provider-sampled, are labeled as
such, and are never synthesized in production. Workers Builds limit posture is read from the Builds
account limits endpoint; WorkerDeck does not infer unavailable minute totals or billing amounts.

## D1 recovery posture

The Backups screen performs read-only verification against D1 Time Travel. It resolves both the
current bookmark and a recent historical bookmark for every WorkerDeck-owned D1 database. Cloudflare
currently restores Time Travel bookmarks in place and does not support cloning from a bookmark, so
WorkerDeck intentionally exposes no restore mutation. A future restore flow must require explicit
destructive confirmation, record the pre-restore bookmark for undo, and account for bound Worker
configuration before it can be enabled.

## Failure behavior

- Missing account credentials return `CLOUDFLARE_NOT_CONNECTED` without creating a release.
- A missing Worker or build trigger returns a guided configuration error.
- Duplicate active releases return `DEPLOYMENT_ALREADY_ACTIVE`.
- Reusing an idempotency key for a different request is rejected.
- Cloudflare authorization details are converted to a sanitized provider error; token values and raw
  responses are never returned to the browser.
