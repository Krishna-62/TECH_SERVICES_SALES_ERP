import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/ui';

const SECTIONS = [
  { to: '/admin/salespeople', title: 'Salespeople', text: 'The people who own visits, follow-ups and deals.' },
  { to: '/admin/users', title: 'Users', text: 'Logins, roles and who reports to whom.' },
  { to: '/admin/audit', title: 'Audit log', text: 'Every account, ownership and record change.' },
];

export default function AdminHome() {
  return (
    <div>
      <PageHeader title="Admin" />
      <div className="grid gap-3 sm:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link key={s.to} to={s.to} className="block bg-white border border-line rounded-xl shadow-card p-4 hover:border-brand/40 transition-colors">
            <div className="text-sm font-semibold">{s.title}</div>
            <div className="text-xs text-ink-muted mt-1">{s.text}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
