import type { UserProfile } from "@/lib/auth/profile";
import { isAdminProfile } from "@/lib/auth/profile";
import type { ApprovalStep, Department, Employee, Group, HrLevel } from "@/lib/hr/model";

/**
 * Who sees what, and who may sign.
 *
 * Three layers, kept apart on purpose:
 *
 * Level - per login, the way Odoo grants app access: none, user, or
 * administrator of HR. A Bettrbyus administrator is an HR administrator.
 * A login with no row is a user.
 *
 * Groups - what a user can look at. A manager group sees every department;
 * a supervisor group sees its members' own department plus the shared ones.
 *
 * Approval chain - who can sign a week off. Being able to see a department
 * says nothing about being able to approve it, and the other way round.
 *
 * Money shows to HR administrators only. Carlos was explicit: cost is for
 * administrators, not users. The groups table keeps a sees_cost column for the
 * day that changes; nothing reads it today.
 */
export type Access = {
  level: HrLevel;
  /** HR administrator: sees everything, signs any step, sees cost. */
  isAdmin: boolean;
  /** Level none: HR is closed to this login. */
  blocked: boolean;
  /** The Paychex person this login is, if their work email matches. */
  employee: Employee | null;
  seesAll: boolean;
  /** Departments this person may look at, when not seesAll. */
  departmentIds: Set<string>;
  seesCost: boolean;
  groups: Group[];
};

export function resolveAccess(
  profile: UserProfile | null,
  data: { employees: Employee[]; groups: Group[]; userAccess: Map<string, HrLevel> }
): Access {
  const globalAdmin = isAdminProfile(profile);
  const stored = profile ? data.userAccess.get(profile.id) : undefined;
  const level: HrLevel = globalAdmin ? "admin" : (stored ?? "user");
  const isAdmin = level === "admin";

  const email = profile?.email?.toLowerCase() ?? null;
  const employee =
    (email && data.employees.find((e) => e.email?.toLowerCase() === email)) || null;

  const mine = employee ? data.groups.filter((g) => g.memberIds.includes(employee.id)) : [];

  const departmentIds = new Set<string>();
  if (employee?.departmentId) departmentIds.add(employee.departmentId);
  for (const group of mine) for (const id of group.departmentIds) departmentIds.add(id);

  return {
    level,
    isAdmin,
    blocked: level === "none",
    employee,
    seesAll: isAdmin || mine.some((g) => g.seesAllDepartments),
    departmentIds,
    seesCost: isAdmin,
    groups: mine,
  };
}

export function canSee(access: Access, departmentId: string): boolean {
  if (access.blocked) return false;
  return access.seesAll || access.departmentIds.has(departmentId);
}

export function visibleDepartments(access: Access, departments: Department[]): Department[] {
  return departments.filter((d) => canSee(access, d.id));
}

/** May this person sign the given step of a department's chain? */
export function canSign(access: Access, step: ApprovalStep | null): boolean {
  if (access.blocked) return false;
  if (access.isAdmin) return true;
  if (!step || !access.employee) return false;
  return step.employeeId === access.employee.id;
}

/** May this person approve a floater into this department? Any approver in its chain, or an admin. */
export function canApproveFloat(access: Access, chain: ApprovalStep[]): boolean {
  if (access.blocked) return false;
  if (access.isAdmin) return true;
  if (!access.employee) return false;
  return chain.some((s) => s.employeeId === access.employee!.id);
}
