import type { WorkspaceRole, WorkspaceViewerRole } from '@workerdeck/contracts';

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: 'Owners',
  admin: 'Admins',
  member: 'Members',
};

export const ACCESS_GROUP_ROLES: readonly WorkspaceRole[] = ['owner', 'admin', 'member'];

export function accessGroupNameFor(role: WorkspaceRole, workspaceName: string): string {
  const sanitized =
    workspaceName
      .replace(/[^A-Za-z0-9 ._-]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || 'WorkerDeck';
  return `WorkerDeck - ${sanitized} - ${ROLE_LABELS[role]}`;
}

export function emailsForRole(
  members: Array<{ role: WorkspaceRole; email: string }>,
  role: WorkspaceRole,
): string[] {
  return [
    ...new Set(
      members.filter((member) => member.role === role).map((member) => member.email.toLowerCase()),
    ),
  ].sort();
}

export function viewerRoleForMember(
  member: { role: WorkspaceRole } | null,
  activeMemberCount: number,
): WorkspaceViewerRole {
  if (member) return member.role;
  return activeMemberCount === 0 ? 'owner' : 'none';
}
