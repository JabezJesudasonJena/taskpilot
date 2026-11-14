import { describe, it, expect } from 'vitest';
import { WorkspaceRole } from '@prisma/client';
import {
  hasAtLeast,
  canChangeRole,
  canRemoveMember,
  canInviteRole,
  ROLE_HIERARCHY,
} from '../../common/roles/role.util.js';

describe('Roles & Permissions (Unit)', () => {
  const roles: WorkspaceRole[] = [
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.MEMBER,
    WorkspaceRole.GUEST,
  ];

  describe('hasAtLeast - All 16 Role Pairings Matrix', () => {
    // OWNER (4) >= [OWNER, ADMIN, MEMBER, GUEST] -> true for all
    it('OWNER hasAtLeast any role', () => {
      for (const target of roles) {
        expect(hasAtLeast(WorkspaceRole.OWNER, target)).toBe(true);
      }
    });

    // ADMIN (3) >= [ADMIN, MEMBER, GUEST] -> true; >= OWNER -> false
    it('ADMIN hasAtLeast ADMIN, MEMBER, GUEST, but NOT OWNER', () => {
      expect(hasAtLeast(WorkspaceRole.ADMIN, WorkspaceRole.OWNER)).toBe(false);
      expect(hasAtLeast(WorkspaceRole.ADMIN, WorkspaceRole.ADMIN)).toBe(true);
      expect(hasAtLeast(WorkspaceRole.ADMIN, WorkspaceRole.MEMBER)).toBe(true);
      expect(hasAtLeast(WorkspaceRole.ADMIN, WorkspaceRole.GUEST)).toBe(true);
    });

    // MEMBER (2) >= [MEMBER, GUEST] -> true; >= [OWNER, ADMIN] -> false
    it('MEMBER hasAtLeast MEMBER, GUEST, but NOT OWNER or ADMIN', () => {
      expect(hasAtLeast(WorkspaceRole.MEMBER, WorkspaceRole.OWNER)).toBe(false);
      expect(hasAtLeast(WorkspaceRole.MEMBER, WorkspaceRole.ADMIN)).toBe(false);
      expect(hasAtLeast(WorkspaceRole.MEMBER, WorkspaceRole.MEMBER)).toBe(true);
      expect(hasAtLeast(WorkspaceRole.MEMBER, WorkspaceRole.GUEST)).toBe(true);
    });

    // GUEST (1) >= GUEST -> true; >= [OWNER, ADMIN, MEMBER] -> false
    it('GUEST hasAtLeast only GUEST', () => {
      expect(hasAtLeast(WorkspaceRole.GUEST, WorkspaceRole.OWNER)).toBe(false);
      expect(hasAtLeast(WorkspaceRole.GUEST, WorkspaceRole.ADMIN)).toBe(false);
      expect(hasAtLeast(WorkspaceRole.GUEST, WorkspaceRole.MEMBER)).toBe(false);
      expect(hasAtLeast(WorkspaceRole.GUEST, WorkspaceRole.GUEST)).toBe(true);
    });

    it('verifies exact numeric rank hierarchy OWNER > ADMIN > MEMBER > GUEST', () => {
      expect(ROLE_HIERARCHY[WorkspaceRole.OWNER]).toBeGreaterThan(
        ROLE_HIERARCHY[WorkspaceRole.ADMIN],
      );
      expect(ROLE_HIERARCHY[WorkspaceRole.ADMIN]).toBeGreaterThan(
        ROLE_HIERARCHY[WorkspaceRole.MEMBER],
      );
      expect(ROLE_HIERARCHY[WorkspaceRole.MEMBER]).toBeGreaterThan(
        ROLE_HIERARCHY[WorkspaceRole.GUEST],
      );
    });
  });

  describe('canChangeRole', () => {
    it('nobody can promote to OWNER via role change', () => {
      for (const actor of roles) {
        for (const current of roles) {
          expect(canChangeRole(actor, current, WorkspaceRole.OWNER)).toBe(
            false,
          );
        }
      }
    });

    it('nobody can change an OWNER role via role change', () => {
      for (const actor of roles) {
        for (const targetRole of roles) {
          expect(canChangeRole(actor, WorkspaceRole.OWNER, targetRole)).toBe(
            false,
          );
        }
      }
    });

    it('OWNER can change ADMIN, MEMBER, GUEST to any non-OWNER role', () => {
      expect(
        canChangeRole(
          WorkspaceRole.OWNER,
          WorkspaceRole.MEMBER,
          WorkspaceRole.ADMIN,
        ),
      ).toBe(true);
      expect(
        canChangeRole(
          WorkspaceRole.OWNER,
          WorkspaceRole.ADMIN,
          WorkspaceRole.MEMBER,
        ),
      ).toBe(true);
      expect(
        canChangeRole(
          WorkspaceRole.OWNER,
          WorkspaceRole.GUEST,
          WorkspaceRole.MEMBER,
        ),
      ).toBe(true);
    });

    it('ADMIN cannot modify OWNER or another ADMIN', () => {
      expect(
        canChangeRole(
          WorkspaceRole.ADMIN,
          WorkspaceRole.OWNER,
          WorkspaceRole.MEMBER,
        ),
      ).toBe(false);
      expect(
        canChangeRole(
          WorkspaceRole.ADMIN,
          WorkspaceRole.ADMIN,
          WorkspaceRole.MEMBER,
        ),
      ).toBe(false);
    });

    it('ADMIN cannot promote anyone to ADMIN', () => {
      expect(
        canChangeRole(
          WorkspaceRole.ADMIN,
          WorkspaceRole.MEMBER,
          WorkspaceRole.ADMIN,
        ),
      ).toBe(false);
      expect(
        canChangeRole(
          WorkspaceRole.ADMIN,
          WorkspaceRole.GUEST,
          WorkspaceRole.ADMIN,
        ),
      ).toBe(false);
    });

    it('ADMIN can change between MEMBER and GUEST', () => {
      expect(
        canChangeRole(
          WorkspaceRole.ADMIN,
          WorkspaceRole.MEMBER,
          WorkspaceRole.GUEST,
        ),
      ).toBe(true);
      expect(
        canChangeRole(
          WorkspaceRole.ADMIN,
          WorkspaceRole.GUEST,
          WorkspaceRole.MEMBER,
        ),
      ).toBe(true);
    });

    it('MEMBER and GUEST cannot change any role', () => {
      expect(
        canChangeRole(
          WorkspaceRole.MEMBER,
          WorkspaceRole.GUEST,
          WorkspaceRole.MEMBER,
        ),
      ).toBe(false);
      expect(
        canChangeRole(
          WorkspaceRole.GUEST,
          WorkspaceRole.MEMBER,
          WorkspaceRole.GUEST,
        ),
      ).toBe(false);
    });
  });

  describe('canRemoveMember', () => {
    it('OWNER cannot leave without transferring ownership', () => {
      expect(
        canRemoveMember(
          WorkspaceRole.OWNER,
          WorkspaceRole.OWNER,
          true, // isSelf
        ),
      ).toBe(false);
    });

    it('ADMIN, MEMBER, and GUEST can leave themselves', () => {
      expect(
        canRemoveMember(WorkspaceRole.ADMIN, WorkspaceRole.ADMIN, true),
      ).toBe(true);
      expect(
        canRemoveMember(WorkspaceRole.MEMBER, WorkspaceRole.MEMBER, true),
      ).toBe(true);
      expect(
        canRemoveMember(WorkspaceRole.GUEST, WorkspaceRole.GUEST, true),
      ).toBe(true);
    });

    it('OWNER can remove ADMIN, MEMBER, or GUEST', () => {
      expect(
        canRemoveMember(WorkspaceRole.OWNER, WorkspaceRole.ADMIN, false),
      ).toBe(true);
      expect(
        canRemoveMember(WorkspaceRole.OWNER, WorkspaceRole.MEMBER, false),
      ).toBe(true);
      expect(
        canRemoveMember(WorkspaceRole.OWNER, WorkspaceRole.GUEST, false),
      ).toBe(true);
    });

    it('ADMIN can remove MEMBER or GUEST, but NOT OWNER or another ADMIN', () => {
      expect(
        canRemoveMember(WorkspaceRole.ADMIN, WorkspaceRole.OWNER, false),
      ).toBe(false);
      expect(
        canRemoveMember(WorkspaceRole.ADMIN, WorkspaceRole.ADMIN, false),
      ).toBe(false);
      expect(
        canRemoveMember(WorkspaceRole.ADMIN, WorkspaceRole.MEMBER, false),
      ).toBe(true);
      expect(
        canRemoveMember(WorkspaceRole.ADMIN, WorkspaceRole.GUEST, false),
      ).toBe(true);
    });

    it('MEMBER and GUEST cannot remove anyone', () => {
      expect(
        canRemoveMember(WorkspaceRole.MEMBER, WorkspaceRole.GUEST, false),
      ).toBe(false);
      expect(
        canRemoveMember(WorkspaceRole.GUEST, WorkspaceRole.MEMBER, false),
      ).toBe(false);
    });
  });

  describe('canInviteRole', () => {
    it('nobody can invite an OWNER', () => {
      for (const actor of roles) {
        expect(canInviteRole(actor, WorkspaceRole.OWNER)).toBe(false);
      }
    });

    it('OWNER can invite ADMIN, MEMBER, GUEST', () => {
      expect(canInviteRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)).toBe(
        true,
      );
      expect(canInviteRole(WorkspaceRole.OWNER, WorkspaceRole.MEMBER)).toBe(
        true,
      );
      expect(canInviteRole(WorkspaceRole.OWNER, WorkspaceRole.GUEST)).toBe(
        true,
      );
    });

    it('ADMIN can invite MEMBER or GUEST, but NOT ADMIN', () => {
      expect(canInviteRole(WorkspaceRole.ADMIN, WorkspaceRole.ADMIN)).toBe(
        false,
      );
      expect(canInviteRole(WorkspaceRole.ADMIN, WorkspaceRole.MEMBER)).toBe(
        true,
      );
      expect(canInviteRole(WorkspaceRole.ADMIN, WorkspaceRole.GUEST)).toBe(
        true,
      );
    });

    it('MEMBER and GUEST cannot invite anyone', () => {
      expect(canInviteRole(WorkspaceRole.MEMBER, WorkspaceRole.GUEST)).toBe(
        false,
      );
      expect(canInviteRole(WorkspaceRole.GUEST, WorkspaceRole.GUEST)).toBe(
        false,
      );
    });
  });
});
