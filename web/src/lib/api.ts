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
    list: (params: { entity_type?: string; limit?: number } = {}) => request<AuditEntry[]>(`/admin/audit${qs(params)}`),
  },
  today: () => request<TodayData>('/today'),
  directory: {
    salespeople: () => request<{ id: number; name: string; employee_code: string }[]>('/salespeople'),
  },
  companies: {
    search: (q: string) => request<CompanySummary[]>(`/companies${qs({ q, limit: 25 })}`),
    checkDuplicates: (name: string, city?: string | null, phone?: string | null) =>
      request<DuplicateCandidate[]>(`/companies/check-duplicates${qs({ name, city, phone })}`),
    get: (id: number) => request<CompanyDetail>(`/companies/${id}`),
    create: (data: CompanyInput & { confirm_new?: boolean; contact?: ContactInput }) =>
      post<CompanyDetail & { primary_contact_id: number | null }>('/companies', data),
    update: (id: number, data: Partial<CompanyInput>) => put<CompanyDetail>(`/companies/${id}`, data),
    addContact: (id: number, data: ContactInput) => post<Contact>(`/companies/${id}/contacts`, data),
  },
  contacts: {
    archive: (id: number) => post<{ ok: true }>(`/contacts/${id}/archive`),
  },
  visits: {
    list: (params: { status?: string; company_id?: number; limit?: number } = {}) => request<Visit[]>(`/visits${qs(params)}`),
    get: (id: number) => request<VisitDetail>(`/visits/${id}`),
    create: (data: {
      company_id: number;
      contact_id?: number | null;
      contact?: ContactInput;
      salesperson_id?: number | null;
      notes?: string;
      client_uuid?: string;
    }) => post<Visit>('/visits', data),
    update: (id: number, data: { notes?: string | null; contact_id?: number | null }) => put<Visit>(`/visits/${id}`, data),
    complete: (
      id: number,
      data: { outcome: Outcome; notes?: string | null; requirements: RequirementInput[]; follow_up?: TaskInput | null }
    ) => post<VisitDetail>(`/visits/${id}/complete`, data),
  },
  tasks: {
    list: (params: { status?: string; due?: string; company_id?: number } = {}) => request<Task[]>(`/tasks${qs(params)}`),
    create: (data: TaskInput & { company_id: number; assignee_salesperson_id?: number | null }) => post<Task>('/tasks', data),
    update: (id: number, data: Partial<TaskInput>) => put<Task>(`/tasks/${id}`, data),
    complete: (id: number, outcome_notes?: string) => post<Task>(`/tasks/${id}/complete`, { outcome_notes }),
    cancel: (id: number, reason: string) => post<Task>(`/tasks/${id}/cancel`, { reason }),
  },
};

function qs(params: Record<string, string | number | undefined | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  return q.size ? `?${q}` : '';
}

// ---------- Field CRM ----------

export interface CompanySummary {
  id: number;
  name: string;
  city: string | null;
  phone: string | null;
}

export interface DuplicateCandidate extends CompanySummary {
  score: number;
  exact: boolean;
  same_phone: boolean;
}

export interface Contact {
  id: number;
  name: string;
  designation: string | null;
  phone: string | null;
  email: string | null;
}

export type ContactInput = { name: string; designation?: string | null; phone?: string | null; email?: string | null };

export interface CompanyInput {
  name: string;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  industry?: string | null;
}

export type Outcome = 'interested' | 'follow_up_needed' | 'quotation_requested' | 'not_interested' | 'no_meeting';
export type TaskType = 'call' | 'visit' | 'demo' | 'technical_discussion' | 'send_quotation' | 'other';
export type Urgency = 'low' | 'normal' | 'high' | 'urgent';

export interface Requirement {
  id: number;
  product_category: string | null;
  description: string;
  specification: string | null;
  quantity: number | null;
  unit: string | null;
  budget: number | null;
  urgency: Urgency;
  purchase_timeline: string | null;
  decision_maker: string | null;
  created_at: string;
  salesperson_name?: string;
}

export interface RequirementInput {
  product_category?: string;
  description: string;
  specification?: string;
  quantity?: number | null;
  unit?: string;
  budget?: number | null;
  urgency?: Urgency;
  purchase_timeline?: string;
  decision_maker?: string;
}

export interface Task {
  id: number;
  company_id: number;
  company_name: string;
  company_city?: string | null;
  assignee_salesperson_id?: number;
  assignee_name: string;
  task_type: TaskType;
  title: string;
  due_date: string;
  priority: 'normal' | 'high';
  status?: 'open' | 'done' | 'cancelled';
  notes?: string | null;
  outcome_notes?: string | null;
  completed_at?: string | null;
  is_overdue: boolean;
}

export interface TaskInput {
  task_type: TaskType;
  title: string;
  due_date: string;
  priority?: 'normal' | 'high';
  notes?: string;
}

export interface Visit {
  id: number;
  company_id: number;
  company_name: string;
  company_city: string | null;
  contact_id: number | null;
  contact_name: string | null;
  contact_designation: string | null;
  contact_phone: string | null;
  salesperson_id: number;
  salesperson_name: string;
  visited_at: string;
  status: 'draft' | 'completed';
  outcome: Outcome | null;
  notes: string | null;
  completed_at: string | null;
}

export interface VisitDetail extends Visit {
  requirements: Requirement[];
  tasks: { id: number; title: string; task_type: TaskType; due_date: string; status: string }[];
}

export interface CompanyDetail extends CompanySummary {
  address: string | null;
  email: string | null;
  gstin: string | null;
  industry: string | null;
  created_by_username: string;
  created_at: string;
  contacts: Contact[];
  visits: { id: number; visited_at: string; status: 'draft' | 'completed'; outcome: Outcome | null; notes: string | null; salesperson_name: string; contact_name: string | null }[];
  tasks: { id: number; title: string; task_type: TaskType; due_date: string; priority: string; assignee_name: string }[];
  requirements: Requirement[];
}

export interface TodayData {
  today: string;
  overdue: Task[];
  due_today: Task[];
  upcoming: Task[];
  draft_visits: { id: number; visited_at: string; company_id: number; company_name: string; salesperson_name: string }[];
  recent_visits: { id: number; visited_at: string; outcome: Outcome; company_id: number; company_name: string; salesperson_name: string }[];
  stats: { visits_this_week: number; companies_visited_30d: number; quotation_requests_30d: number; overdue_follow_ups: number };
}
