import type { DashboardSummary, EmailRoutingData } from '@workerdeck/contracts';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Mail, Plus, ShieldCheck, Trash2 } from '../components/icon';
import {
  createProjectEmailRoutingAddress,
  createProjectEmailRoutingRule,
  deleteProjectEmailRoutingAddress,
  deleteProjectEmailRoutingRule,
  getProjectEmailRouting,
} from '../lib/api';
import { titleCase } from '../lib/format';

export function EmailPage({ summary }: { summary: DashboardSummary | null }): React.JSX.Element {
  const targets = useMemo(
    () =>
      (summary?.projects ?? []).flatMap((project) => {
        const environment = summary?.environments.find(
          (candidate) => candidate.projectId === project.id && candidate.kind === 'production',
        );
        return environment ? [{ project, environment }] : [];
      }),
    [summary],
  );
  const [projectId, setProjectId] = useState('');
  const [data, setData] = useState<EmailRoutingData | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [destination, setDestination] = useState('');
  const [source, setSource] = useState('');
  const [routeDestination, setRouteDestination] = useState('');

  const target = targets.find((candidate) => candidate.project.id === projectId) ?? targets[0];
  const selectedZone =
    data?.zones.find((zone) => zone.zoneId === data.selectedZoneId) ?? data?.zones[0];
  const verified = data?.addresses.filter((address) => address.verified) ?? [];

  useEffect(() => {
    if (!target) {
      setData(null);
      setStatus('idle');
      return;
    }
    if (!projectId) setProjectId(target.project.id);
    let active = true;
    setStatus('loading');
    setMessage(null);
    void getProjectEmailRouting(target.project.id, target.environment.id)
      .then((next) => {
        if (!active) return;
        setData(next);
        setRouteDestination(next.addresses.find((address) => address.verified)?.email ?? '');
        setStatus('ready');
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setMessage(reason instanceof Error ? reason.message : 'Email Routing could not be loaded.');
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [projectId, target]);

  const fail = (reason: unknown, fallback: string) => {
    setMessage(reason instanceof Error ? reason.message : fallback);
    setBusy(null);
  };

  const addDestination = () => {
    if (!target || !destination.trim()) return;
    setBusy('destination');
    setMessage(null);
    void createProjectEmailRoutingAddress(
      target.project.id,
      target.environment.id,
      destination.trim(),
      selectedZone?.zoneId,
    )
      .then((next) => {
        setData(next);
        setDestination('');
      })
      .catch((reason: unknown) => fail(reason, 'The destination address could not be added.'))
      .finally(() => setBusy(null));
  };

  const removeDestination = (addressId: string, email: string) => {
    if (!target) return;
    if (!window.confirm(`Remove ${email} from your available destination emails?`)) return;
    setBusy(addressId);
    setMessage(null);
    void deleteProjectEmailRoutingAddress(
      target.project.id,
      target.environment.id,
      addressId,
      selectedZone?.zoneId,
    )
      .then(setData)
      .catch((reason: unknown) => fail(reason, 'The destination address could not be removed.'))
      .finally(() => setBusy(null));
  };

  const addRoute = () => {
    if (!target || !selectedZone || !source.trim() || !routeDestination) return;
    setBusy('route');
    setMessage(null);
    void createProjectEmailRoutingRule(target.project.id, target.environment.id, {
      zoneId: selectedZone.zoneId,
      matcherEmail: source.trim(),
      destinationEmail: routeDestination,
      enabled: true,
    })
      .then((next) => {
        setData(next);
        setSource('');
      })
      .catch((reason: unknown) => fail(reason, 'The routing address could not be created.'))
      .finally(() => setBusy(null));
  };

  const removeRoute = (ruleId: string, matcherEmail: string) => {
    if (!target || !selectedZone) return;
    if (!window.confirm(`Remove the routing address ${matcherEmail}?`)) return;
    setBusy(ruleId);
    setMessage(null);
    void deleteProjectEmailRoutingRule(
      target.project.id,
      target.environment.id,
      ruleId,
      selectedZone.zoneId,
    )
      .then(setData)
      .catch((reason: unknown) => fail(reason, 'The routing address could not be removed.'))
      .finally(() => setBusy(null));
  };

  return (
    <div className="standard-page email-overview-page">
      <section className="page-intro page-intro--compact">
        <div>
          <span className="eyebrow">Cloudflare email</span>
          <h1>Email</h1>
          <p>
            Create inbound addresses, connect them to projects, and manage verified destinations.
          </p>
        </div>
        <span className="plan-chip">{titleCase(summary?.account.plan ?? 'free')} plan</span>
      </section>

      <section className="panel email-workspace-bar">
        <label>
          <span>Project</span>
          <select
            value={target?.project.id ?? ''}
            onChange={(event) => setProjectId(event.target.value)}
          >
            {targets.map(({ project }) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <span>
          <ShieldCheck size={16} />
          {selectedZone ? selectedZone.zoneName : 'A custom domain is required'}
        </span>
        {target ? (
          <Link className="text-button" to={`/projects/${target.project.id}/email`}>
            Advanced routing <ArrowRight size={15} />
          </Link>
        ) : null}
      </section>

      {message ? (
        <div className="inline-alert" role="alert">
          {message}
        </div>
      ) : null}
      {status === 'loading' ? (
        <section className="panel email-loading-state" aria-busy="true">
          Loading email addresses…
        </section>
      ) : null}
      {status === 'error' ? (
        <section className="panel email-loading-state">
          Select another project or try again.
        </section>
      ) : null}
      {status === 'ready' && data ? (
        <div className="email-management-grid">
          <section className="panel email-management-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Available emails</span>
                <h2>Destinations</h2>
              </div>
              <span className="panel-count">{data.addresses.length}</span>
            </div>
            <form
              className="email-inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                addDestination();
              }}
            >
              <label>
                <span>Destination email</span>
                <input
                  type="email"
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                  placeholder="person@example.com"
                />
              </label>
              <button
                className="button button--secondary"
                type="submit"
                disabled={!destination.trim() || busy !== null}
              >
                <Plus size={15} /> Add email
              </button>
            </form>
            <div className="email-record-list">
              {data.addresses.map((address) => {
                const inUse = data.rules.some((rule) => rule.destinationEmail === address.email);
                return (
                  <div className="email-record" key={address.id}>
                    <span
                      className={
                        address.verified
                          ? 'email-record-icon email-record-icon--ready'
                          : 'email-record-icon'
                      }
                    >
                      {address.verified ? <CheckCircle2 size={16} /> : <Mail size={16} />}
                    </span>
                    <span>
                      <strong>{address.email}</strong>
                      <small>
                        {address.verified
                          ? inUse
                            ? 'Verified · connected'
                            : 'Verified'
                          : 'Verification pending'}
                      </small>
                    </span>
                    <button
                      className="row-action danger-action"
                      type="button"
                      aria-label={`Remove ${address.email}`}
                      disabled={busy !== null || inUse}
                      title={inUse ? 'Remove its routing rules first' : 'Remove destination'}
                      onClick={() => removeDestination(address.id, address.email)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="panel email-management-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Incoming</span>
                <h2>Routing addresses</h2>
              </div>
              <span className="panel-count">{data.rules.length}</span>
            </div>
            <form
              className="email-route-form"
              onSubmit={(event) => {
                event.preventDefault();
                addRoute();
              }}
            >
              <label>
                <span>Address on {selectedZone?.zoneName ?? 'your domain'}</span>
                <input
                  type="email"
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  placeholder={`support@${selectedZone?.zoneName ?? 'example.com'}`}
                />
              </label>
              <label>
                <span>Forward to</span>
                <select
                  value={routeDestination}
                  onChange={(event) => setRouteDestination(event.target.value)}
                >
                  <option value="">Choose a verified email</option>
                  {verified.map((address) => (
                    <option key={address.id} value={address.email}>
                      {address.email}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button button--secondary"
                type="submit"
                disabled={!selectedZone || !source.trim() || !routeDestination || busy !== null}
              >
                <Plus size={15} /> Create route
              </button>
            </form>
            <div className="email-record-list">
              {data.rules.map((rule) => (
                <div className="email-record email-route-record" key={rule.id}>
                  <span className="email-record-icon email-record-icon--ready">
                    <Mail size={16} />
                  </span>
                  <span>
                    <strong>{rule.matcherEmail}</strong>
                    <small>Forwards to {rule.destinationEmail}</small>
                  </span>
                  <span className={rule.enabled ? 'status status--ready' : 'status'}>
                    {rule.enabled ? 'Active' : 'Paused'}
                  </span>
                  <button
                    className="row-action danger-action"
                    type="button"
                    aria-label={`Remove ${rule.matcherEmail}`}
                    disabled={busy !== null}
                    onClick={() => removeRoute(rule.id, rule.matcherEmail)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              {data.rules.length === 0 ? (
                <div className="email-empty-record">
                  No routing addresses yet. Create one above.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
