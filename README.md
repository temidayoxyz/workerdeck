<div align="center">

<img src="./docs/assets/workerdeck-mark.svg" alt="WorkerDeck mark" width="92" />

# WorkerDeck

### A self-hosted application control plane for Cloudflare

Deploy Workers, manage data services, inspect releases, configure domains, and operate application
environments from one secure workspace.

[Getting started](#getting-started) · [Architecture](./docs/architecture.md) ·
[Production installation](./docs/installation.md) · [Security](./SECURITY.md)

</div>

---

WorkerDeck brings the operational model of a modern deployment platform to infrastructure you own.
It runs inside your Cloudflare account, keeps application builds isolated from the privileged control
plane, and records every resource it creates in an auditable ownership ledger.

The project is designed for teams that want a clean, coherent operating surface without surrendering
their Workers, data, domains, or provider credentials to a hosted intermediary.

## What WorkerDeck manages

| Area          | Capabilities                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------- |
| Projects      | GitHub repository catalog, framework configuration, production and preview environments      |
| Deployments   | Cloudflare Builds triggers, live build logs, release history, cancellation, version rollback |
| Environment   | Build variables, masked build secrets, encrypted Worker runtime secrets                      |
| Data services | Owned D1 databases, KV namespaces, and R2 buckets with compensating cleanup                  |
| Domains       | Conflict-aware Worker custom-domain attachment and certificate posture                       |
| Operations    | Sampled request analytics, errors, CPU quantiles, build-limit posture, audit history         |
| Recovery      | Read-only D1 Time Travel verification with destructive restore deliberately locked           |

## How it works

```text
Browser
  └─ WorkerDeck dashboard
       └─ Authenticated control Worker
            ├─ D1 metadata, audit, and ownership ledger
            ├─ Cloudflare provider APIs
            └─ GitHub App metadata access

Application repository
  └─ Cloudflare Workers Builds
       └─ Worker version → preview or production traffic
```

WorkerDeck does not execute repository code in its control Worker. Cloudflare Builds checks out and
builds application repositories using a dedicated deployment token; the more privileged control-plane
token is never exposed to a build.

## Security model

- Production access is authenticated with a validated Cloudflare Access JWT.
- Development authentication is rejected anywhere except `localhost` and `127.0.0.1`.
- Provider credentials and GitHub private keys are encrypted Worker secrets, never D1 records.
- Mutations require a trusted origin, runtime-validated input, and replay-safe idempotency keys.
- WorkerDeck mutates only resources present in its ownership ledger; it never silently adopts existing
  infrastructure.
- Destructive data restore and resource deletion remain unavailable until they can be made recoverable
  and binding-aware.

Read the full [security policy](./SECURITY.md) and [threat model](./docs/threat-model.md) before exposing
an installation publicly.

## Getting started

### Requirements

- Node.js 22 or newer
- npm 10 or newer
- A Cloudflare account for live provider operations

### Run locally

```bash
npm install
npm run dev
```

Start the local control Worker in a second terminal:

```bash
npm run dev -w @workerdeck/control-plane
```

Open [http://127.0.0.1:5173/?demo=1](http://127.0.0.1:5173/?demo=1) for the populated product preview.
Remove `?demo=1` to use the local D1-backed control plane.

### Validate the repository

```bash
npm run check
```

The quality gate runs formatting verification, zero-warning lint, TypeScript checks for every
workspace, the security and provider test suites, the production dashboard bundle, and a Cloudflare
Worker dry run.

## Production installation

WorkerDeck uses a deliberate bootstrap flow:

1. Keep this repository in GitHub as the reviewed source of truth and CI origin.
2. Run the WorkerDeck installer once from a trusted checkout.
3. The installer deploys the control Worker, provisions D1, applies migrations, and stores tokens as
   encrypted Worker secrets.
4. Protect the resulting Worker with Cloudflare Access.
5. Connect the WorkerDeck GitHub App to enable the in-dashboard repository picker.
6. Application repositories are then checked out and deployed directly by Cloudflare Workers Builds.

This avoids a circular dependency in which WorkerDeck would need to be running before it could deploy
itself. After bootstrap, the WorkerDeck repository can also be connected to Cloudflare Git integration
for normal continuous delivery.

See the [production installation guide](./docs/installation.md) for the required Cloudflare values,
least-privilege token scopes, GitHub App setup, and verification checklist.

The installer accepts the Cloudflare account and Access identifiers, the dedicated build-token ID,
and the WorkerDeck GitHub App ID and slug. It prompts interactively for all three secret values: the
control-plane token, the application build token, and the GitHub App private key.

## Repository layout

```text
apps/dashboard       React and Vite operations dashboard
apps/control-plane   Hono API deployed as a Cloudflare Worker
packages/contracts   Runtime-validated API and manifest contracts
packages/provider    Cloudflare API boundary and framework adapters
packages/cli         Installation and operator CLI
docs                 Architecture, operations, installation, and threat model
```

## Project status

WorkerDeck is an early release candidate. The end-to-end control-plane architecture, responsive
dashboard, repository import, deployment lifecycle, environment management, owned resources, domains,
analytics, and read-only recovery posture are implemented and locally verified.

The following operations remain intentionally guarded:

- destructive D1 Time Travel restore;
- automatic deletion of managed resources;
- mutation of arbitrary plaintext Worker bindings;
- R2 backup-policy orchestration;
- full distributed trace and live-tail ingestion.

These are product safety boundaries, not simulated capabilities.

## Documentation

- [Production installation](./docs/installation.md)
- [Architecture](./docs/architecture.md)
- [Deployment operations](./docs/deployment-operations.md)
- [Threat model](./docs/threat-model.md)
- [Security policy](./SECURITY.md)
- [Contributing](./CONTRIBUTING.md)

## License

WorkerDeck is available under the [Apache License 2.0](./LICENSE).
