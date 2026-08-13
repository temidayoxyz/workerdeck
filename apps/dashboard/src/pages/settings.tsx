import type { DashboardSummary } from '@workerdeck/contracts';
import { CheckCircle2, ExternalLink, KeyRound, ShieldCheck } from '../components/icon';

export function SettingsPage({ summary }: { summary: DashboardSummary | null }): React.JSX.Element {
  return (
    <div className="standard-page settings-page">
      <section className="page-intro page-intro--compact">
        <div>
          <span className="eyebrow">Control plane</span>
          <h1>Settings</h1>
          <p>Account access, credentials, and operational safeguards.</p>
        </div>
      </section>
      <section className="panel settings-section">
        <div className="settings-icon">
          <ShieldCheck size={20} />
        </div>
        <div>
          <h2>Cloudflare account</h2>
          <p>The account WorkerDeck uses for explicitly approved infrastructure changes.</p>
          <div className="settings-value">
            <span>
              <CheckCircle2 size={15} />
              {summary?.account.name ?? 'Not connected'}
            </span>
            <code>{summary?.account.id ?? 'No account ID'}</code>
          </div>
        </div>
        <button className="button button--secondary" type="button" disabled>
          Verify access <ExternalLink size={15} />
        </button>
      </section>
      <section className="panel settings-section">
        <div className="settings-icon">
          <KeyRound size={20} />
        </div>
        <div>
          <h2>Provider credential</h2>
          <p>
            The token is stored as an encrypted Worker secret. WorkerDeck cannot display it after
            installation.
          </p>
          <div className="settings-value">
            <span>
              {summary?.account.connected ? 'Credential configured' : 'Credential required'}
            </span>
          </div>
        </div>
        <button className="button button--secondary" type="button" disabled>
          Rotate token
        </button>
      </section>
    </div>
  );
}
