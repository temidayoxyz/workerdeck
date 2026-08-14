import { describe, expect, it } from 'vitest';
import type { WorkspaceRole } from '@workerdeck/contracts';
import { accessGroupNameFor, emailsForRole, viewerRoleForMember } from './access';

describe('accessGroupNameFor', () => {
  it('builds a stable, sanitized group name per role', () => {
    expect(accessGroupNameFor('owner', 'Temidayo Cloud!')).toBe(
      'WorkerDeck - Temidayo Cloud - Owners',
    );
    expect(accessGroupNameFor('admin', '   ')).toBe('WorkerDeck - WorkerDeck - Admins');
  });
});

describe('emailsForRole', () => {
  it('returns sorted, unique emails for one role', () => {
    const members: Array<{ role: WorkspaceRole; email: string }> = [
      { role: 'owner', email: 'z@example.com' },
      { role: 'owner', email: 'a@example.com' },
      { role: 'admin', email: 'm@example.com' },
      { role: 'owner', email: 'A@EXAMPLE.COM' },
    ];
    expect(emailsForRole(members, 'owner')).toEqual(['a@example.com', 'z@example.com']);
  });
});

describe('viewerRoleForMember', () => {
  it('treats an unlisted actor as owner only while the workspace is unseeded', () => {
    expect(viewerRoleForMember(null, 0)).toBe('owner');
    expect(viewerRoleForMember(null, 3)).toBe('none');
    expect(viewerRoleForMember({ role: 'member' }, 3)).toBe('member');
  });
});
