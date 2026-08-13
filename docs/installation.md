# Production installation

This guide bootstraps WorkerDeck into a Cloudflare account without committing credentials or provider
identifiers to the repository.

## Deployment model

WorkerDeck itself is bootstrapped once with Wrangler from a trusted checkout. This creates the control
Worker and its D1 ownership ledger before repository-driven deployment is available. GitHub remains the
reviewed source of truth and GitHub Actions runs the repository quality gate.

After bootstrap, Cloudflare Workers Builds checks out and deploys application repositories selected in
WorkerDeck. Repository code never runs in the privileged control Worker. The WorkerDeck repository can
also be connected to Cloudflare Git integration for subsequent continuous delivery.

## Information required from the account owner

The following values are configuration rather than secrets and may be shared with the operator:

| Value                           | Where to find it                                                                |
| ------------------------------- | ------------------------------------------------------------------------------- |
| Cloudflare account ID           | Account Home → the selected account → Account ID                                |
| Cloudflare account display name | Account Home                                                                    |
| Public dashboard hostname       | A hostname in a Cloudflare-managed zone, such as `deck.example.com`             |
| Access team domain              | Zero Trust → Settings; usually `<team>.cloudflareaccess.com`                    |
| Access application audience     | Zero Trust → Access → Applications → WorkerDeck → Application Audience tag      |
| Allowed identity                | The exact email, email domain, or identity group permitted by the Access policy |
| Build-token ID                  | My Profile → API Tokens → the dedicated build token → token ID                  |

The GitHub setup also requires the non-secret WorkerDeck GitHub App ID and URL slug. Its private key
is entered only at the encrypted installer prompt.

Secret token values and the GitHub App private key must not be pasted into chat, committed to Git, or
stored in D1. Enter them only through `wrangler secret put` or the installer prompts.

## 1. Choose the public endpoint

Use a dedicated hostname, for example `deck.example.com`. A Worker Custom Domain is the recommended
route because Cloudflare manages DNS and TLS for the Worker origin.

For a production installation, disable or protect alternate `workers.dev` and preview endpoints so the
Access policy cannot be bypassed.

## 2. Create the Access application

In Cloudflare Zero Trust:

1. Open **Access → Applications**.
2. Create a **Self-hosted** application for the WorkerDeck hostname or control Worker.
3. Add an **Allow** policy for the intended administrator email, domain, or identity group.
4. Copy the team domain and Application Audience tag.

WorkerDeck independently verifies the Access assertion issuer, audience, RS256 signature, and actor
identity. Missing or invalid assertions fail closed.

## 3. Create two user-scoped API tokens

Cloudflare Workers Builds requires user-scoped tokens. Limit both tokens to the single Cloudflare
account that will host WorkerDeck.

### Control-plane token

Create a custom token named `WorkerDeck control plane` with these account permissions:

| Permission                   | Access | Used for                                                  |
| ---------------------------- | ------ | --------------------------------------------------------- |
| Workers Builds Configuration | Edit   | Connections, triggers, builds, and build variables        |
| Workers Scripts              | Edit   | Worker bootstrap, runtime secrets, versions, and rollback |
| Account Analytics            | Read   | Worker request, error, subrequest, and CPU metrics        |
| D1                           | Edit   | Owned database provisioning and Time Travel verification  |
| Workers KV Storage           | Edit   | Owned KV namespace provisioning                           |
| Workers R2 Storage           | Edit   | Owned R2 bucket provisioning                              |

Only include resource types that will be enabled. Token resource scope should include the selected
account only.

### Application build token

Create a separate token named `WorkerDeck application builds` with:

| Permission      | Access |
| --------------- | ------ |
| Workers Scripts | Edit   |

Record both token values. The installer verifies the application-build token and derives its
non-secret token ID automatically. Cloudflare Builds stores this token for application deployment.
WorkerDeck never gives the control-plane token to repository builds.

## 4. Authenticate Wrangler

Authenticate the local Wrangler CLI with an account identity authorized to create the Worker and D1
database:

```bash
npx wrangler login
npx wrangler whoami
```

This login is used only for the bootstrap operation. The deployed Worker uses its encrypted scoped
tokens afterward.

## 5. Run the installer

Build the operator CLI:

```bash
npm run build -w @workerdeck/cli
```

Then run:

```bash
node packages/cli/dist/index.js install \
  --account-id <account-id> \
  --account-name "<account-name>" \
  --github-app-id <github-app-id> \
  --github-app-slug <github-app-slug> \
  --github-app-private-key-file /secure/path/to/github-app.private-key.pem \
  --access-team-domain <team.cloudflareaccess.com> \
  --access-audience <application-audience> \
  --dashboard-origin https://deck.example.com
```

The installer builds the dashboard, attaches the selected Worker Custom Domain, disables alternate
`workers.dev` and preview URLs, provisions its D1 database, applies all migrations, and prompts
separately for both token values. Generated account configuration is written beneath ignored
`.wrangler/` state and must not be committed. Token input is hidden; secret values are verified in
memory and piped directly to Wrangler without appearing in command-line arguments.

## 6. Configure the WorkerDeck GitHub App

The Vercel-style private repository picker uses a dedicated GitHub App. Create it under the GitHub
organization or account that owns the repositories.

Use:

- Repository permission: **Metadata — Read-only**.
- Setup URL: `https://deck.example.com/projects/new`.
- Webhooks: disabled; WorkerDeck does not consume webhook deliveries.
- Installation scope: only the repositories WorkerDeck should display.

The installer stores `GITHUB_APP_ID` and `GITHUB_APP_SLUG` as non-secret Worker configuration and
prompts for `GITHUB_APP_PRIVATE_KEY` as an encrypted secret. WorkerDeck creates short-lived
installation tokens on demand and stores only installation metadata in D1.

Cloudflare's own GitHub App must also be authorized once for Workers Builds. It is responsible for the
actual repository checkout and build; the WorkerDeck GitHub App powers the repository catalog and
selection experience.

## 7. Verify the installation

Complete these checks before inviting other operators:

1. Opening the dashboard redirects through the intended Access policy.
2. `/api/health` returns `200` after authentication routing is configured.
3. The dashboard reports the expected Cloudflare account as connected.
4. GitHub shows only the repositories granted to the WorkerDeck App.
5. Import a small test Worker and verify production and preview triggers.
6. Add one build variable and one runtime secret; confirm neither value appears in D1 or API output.
7. Attach a test domain and confirm certificate issuance.
8. Review the audit events and remove the test project only through a planned operator procedure.

## Ongoing delivery

For changes to WorkerDeck itself, use pull requests and the repository CI gate. After the initial
bootstrap, either redeploy from a trusted checkout with the generated configuration or connect this
repository to Cloudflare Git integration. Do not place production secrets in GitHub Actions variables
unless the workflow is explicitly designed and reviewed for that trust boundary.

See [deployment operations](./deployment-operations.md) for the application release lifecycle and
[SECURITY.md](../SECURITY.md) for credential handling and vulnerability reporting.
