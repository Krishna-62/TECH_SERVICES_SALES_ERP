import type { Role } from './roles';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error || `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const put = <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) });

export interface SessionUser {
  id: number;
  username: string;
  role: Role;
  salesperson_id: number | null;
}

export interface UserAccount {
  id: number;
  username: string;
  role: Role;
  is_active: boolean;
  deactivated_at: string | null;
  salesperson_id: number | null;
  salesperson_name: string | null;
  salesperson_code: string | null;
  manager_user_id: number | null;
  manager_username: string | null;
  created_at: string;
}

export interface UserAssignment {
  role: Role;
  salesperson_id: number | null;
  manager_user_id: number | null;
}

export interface Salesperson {
  id: number;
  employee_code: string;
  name: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  erp_sales_engineer_id: number | null;
  user_id: number | null;
  username: string | null;
  user_is_active: boolean | null;
}

export type SalespersonInput = Pick<Salesperson, 'employee_code' | 'name' | 'phone' | 'email' | 'erp_sales_engineer_id'>;

export interface AuditEntry {
  id: number;
  at: string;
  action: string;
  entity_type: string;
  entity_id: number | null;
  summary: string | null;
  actor_username: string | null;
}

export const api = {
  auth: {
    me: () => request<{ needsSetup?: boolean; user?: SessionUser }>('/auth/me'),
    login: (username: string, password: string) => post<{ user: SessionUser }>('/auth/login', { username, password }),
    setup: (username: string, password: string) => post<{ user: SessionUser }>('/auth/setup', { username, password }),
    logout: () => post<{ ok: true }>('/auth/logout'),
  },
  users: {
    list: () => request<UserAccount[]>('/admin/users'),
    create: (data: { username: string; password: string } & UserAssignment) => post<UserAccount>('/admin/users', data),
    update: (id: number, data: UserAssignment) => put<UserAccount>(`/admin/users/${id}`, data),
    deactivate: (id: number, reason: string) => post<UserAccount>(`/admin/users/${id}/deactivate`, { reason }),
    reactivate: (id: number) => post<UserAccount>(`/admin/users/${id}/reactivate`),
    resetPassword: (id: number, password: string) => post<{ ok: true }>(`/admin/users/${id}/reset-password`, { password }),
  },
  salespeople: {
    list: () => request<Salesperson[]>('/admin/salespeople'),
    create: (data: SalespersonInput) => post<Salesperson>('/admin/salespeople', data),
    update: (id: number, data: Partial<SalespersonInput>) => put<Salesperson>(`/admin/salespeople/${id}`, data),
    deactivate: (id: number) => post<Salesperson>(`/admin/salespeople/${id}/deactivate`),
    reactivate: (id: number) => post<Salesperson>(`/admin/salespeople/${id}/reactivate`),
  },
  audit: {
    list: (params: { entity_type?: string; limit?: number } = {}) => {
      const q = new URLSearchParams();
      if (params.entity_type) q.set('entity_type', params.entity_type);
      if (params.limit) q.set('limit', String(params.limit));
      return request<AuditEntry[]>(`/admin/audit${q.size ? `?${q}` : ''}`);
    },
  },
};
