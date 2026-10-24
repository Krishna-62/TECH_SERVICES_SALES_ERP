// Mirrors api/auth/roles.js. The API enforces access; this only decides what to show.
export type Role = 'admin' | 'managing_director' | 'sales_manager' | 'salesperson' | 'office_staff';

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  managing_director: 'Managing Director',
  sales_manager: 'Sales Manager',
  salesperson: 'Salesperson',
  office_staff: 'Office Staff',
};

export const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as Role[]).map((value) => ({ value, label: ROLE_LABELS[value] }));

export const MANAGER_ROLES: Role[] = ['admin', 'managing_director', 'sales_manager'];

export function isAdminRole(role: Role | undefined) {
  return role === 'admin' || role === 'managing_director';
}

export function roleLabel(role: string | undefined) {
  return (role && ROLE_LABELS[role as Role]) || role || '';
}
