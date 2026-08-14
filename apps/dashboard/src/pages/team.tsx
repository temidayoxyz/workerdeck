import type {
  AccessTeam,
  DashboardSummary,
  WorkspaceMember,
  WorkspaceRole,
} from '@workerdeck/contracts';
import { useEffect, useState } from 'react';
import {
  getAccessTeam,
  inviteMember,
  removeMember,
  syncAccessGroups,
  updateMemberRole,
} from '../lib/api';
import { relativeTime, titleCase } from '../lib/format';
import { AlertCircle, Plus, RefreshCw, ShieldCheck, Trash2, Users } from '../components/icon';

const ROLES: readonly WorkspaceRole[] = ['owner', 'admin', 'member'];

export function TeamPage({ summary }: { summary: DashboardSummary | null }): React.JSX.Element {
  const [team, setTeam] = useState<AccessTeam | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('member');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setStatus('loading');
    void getAccessTeam()
      .then((result) => {
        if (!active) return;
        setTeam(result);
        setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('unavailable');
      });
    return () => {
      active = false;
    };
  }, []);
  const viewerRole = team?.viewer.role ?? summary?.viewer.role ?? 'none';
  const canManage = viewerRole === 'owner' || viewerRole === 'admin';
  const canAssignOwner = viewerRole === 'owner';
  const fail = (reason: unknown, fallback: string) =>
    setError(reason instanceof Error ? reason.message : fallback);
  const invite = () => {
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy('invite');
    setError(null);
    setNotice(null);
    void inviteMember({ email: trimmed, role })
      .then((result) => {
        setTeam(result);
        setNotice(`${trimmed} invited as ${titleCase(role)}.`);
        setEmail('');
      })
      .catch((reason: unknown) => fail(reason, 'The member could not be invited.'))
      .finally(() => setBusy(null));
  };
  const changeRole = (member: WorkspaceMember, next: WorkspaceRole) => {
    if (member.role === next) return;
    setBusy(`role:${member.id}`);
    setError(null);
    setNotice(null);
    void updateMemberRole(member.id, next)
      .then((result) => {
        setTeam(result);
        setNotice(`${member.email} is now ${titleCase(next)}.`);
      })
      .catch((reason: unknown) => fail(reason, 'The role could not be updated.'))
      .finally(() => setBusy(null));
  };
  const remove = (member: WorkspaceMember) => {
    setBusy(`remove:${member.id}`);
    setError(null);
    setNotice(null);
    void removeMember(member.id)
      .then((result) => {
        setTeam(result);
        setNotice(`${member.email} was removed from the workspace.`);
      })
      .catch((reason: unknown) => fail(reason, 'The member could not be removed.'))
      .finally(() => setBusy(null));
  };
  const sync = () => {
    setBusy('sync');
    setError(null);
    setNotice(null);
    void syncAccessGroups()
      .then((result) => {
        setTeam(result);
        setNotice('Cloudflare Access groups synced.');
      })
      .catch((reason: unknown) => fail(reason, 'Access groups could not be synced.'))
      .finally(() => setBusy(null));
  };
  return (
    <div className="standard-page team-page">
      <section className="page-intro page-intro--compact">
        <div>
          <span className="eyebrow">Cloudflare Access</span>
          <h1>Team &amp; roles</h1>
          <p>Workspace members mapped to Cloudflare Access groups by role.</p>
        </div>
        <span className={`role-chip role-chip--${viewerRole}`}>
          You are {titleCase(viewerRole)}
        </span>
      </section>
      {error ? <div className="inline-alert">{error}</div> : null}
      {notice ? <div className="cache-notice">{notice}</div> : null}
      {status === 'loading' ? (
        <section className="panel team-state-panel">
          <p className="muted-copy">Loading workspace members…</p>
        </section>
      ) : status === 'unavailable' ? (
        <section className="panel team-state-panel">
          <AlertCircle size={20} />
          <p>WorkerDeck could not load workspace members.</p>
        </section>
      ) : team ? (
        <>
          <section className="panel team-members-panel">
            <div className="section-heading">
              <h2>
                Members <span>· {team.members.length}</span>
              </h2>
              <Users size={18} />
            </div>
            {canManage ? (
              <form
                className="team-invite-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  invite();
                }}
              >
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  placeholder="ada@example.com"
                  aria-label="Member email"
                  autoComplete="off"
                />
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value as WorkspaceRole)}
                  aria-label="Member role"
                  disabled={busy !== null}
                >
                  {ROLES.map((option) => (
                    <option
                      key={option}
                      value={option}
                      disabled={option === 'owner' && !canAssignOwner}
                    >
                      {titleCase(option)}
                    </option>
                  ))}
                </select>
                <button
                  className="button button--primary"
                  type="submit"
                  disabled={!email.trim() || busy !== null}
                >
                  <Plus size={15} /> Invite
                </button>
              </form>
            ) : null}
            <div className="team-member-list">
              {team.members.map((member) => {
                const isViewer = member.email.toLowerCase() === team.viewer.email?.toLowerCase();
                return (
                  <div className="team-member-row" key={member.id}>
                    <span className="member-avatar">{member.email.slice(0, 1).toUpperCase()}</span>
                    <span className="member-identity">
                      <strong>
                        {member.email}
                        {isViewer ? <em>you</em> : null}
                      </strong>
                      <small>
                        Invited by {member.invitedBy ?? 'workspace seed'} ·{' '}
                        {relativeTime(member.createdAt)}
                      </small>
                    </span>
                    <select
                      className="member-role-select"
                      value={member.role}
                      disabled={!canManage || busy !== null}
                      onChange={(event) => changeRole(member, event.target.value as WorkspaceRole)}
                    >
                      {ROLES.map((option) => (
                        <option
                          key={option}
                          value={option}
                          disabled={option === 'owner' && !canAssignOwner}
                        >
                          {titleCase(option)}
                        </option>
                      ))}
                    </select>
                    {canManage ? (
                      <button
                        className="row-action danger-action"
                        type="button"
                        aria-label={`Remove ${member.email}`}
                        disabled={busy !== null || (isViewer && member.role === 'owner')}
                        onClick={() => remove(member)}
                      >
                        <Trash2 size={15} />
                      </button>
                    ) : (
                      <i className="member-row-spacer" aria-hidden="true" />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          <section className="panel team-groups-panel">
            <div className="section-heading">
              <h2>Cloudflare Access groups</h2>
              <ShieldCheck size={18} />
            </div>
            <p className="team-groups-note">
              Add these Zero Trust groups to your Cloudflare Access application policy. WorkerDeck
              keeps each group's membership in sync with the roles above.
            </p>
            <div className="team-group-list">
              {team.groups.map((group) => (
                <div className="team-group-row" key={group.role}>
                  <span className={`role-chip role-chip--${group.role}`}>
                    {titleCase(group.role)}
                  </span>
                  <span className="team-group-name">
                    <code>{group.name}</code>
                    <small>
                      {group.syncError ??
                        (group.cloudflareId
                          ? `Synced ${relativeTime(group.syncedAt)}`
                          : 'Not created yet')}
                    </small>
                  </span>
                </div>
              ))}
            </div>
            <div className="team-panel-footer">
              <button
                className="button button--secondary"
                type="button"
                disabled={!canManage || busy !== null}
                onClick={sync}
              >
                <RefreshCw size={15} />
                {busy === 'sync' ? 'Syncing…' : 'Sync Access groups'}
              </button>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
