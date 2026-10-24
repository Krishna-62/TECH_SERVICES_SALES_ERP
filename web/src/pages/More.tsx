import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { canRecordQuotations, isAdminRole } from '../lib/roles';
import { PageHeader } from '../components/ui';

// Phones show four tabs; everything else lives here.
export default function More() {
  const { user } = useAuth();
  const links = [
    { to: '/companies', title: 'Companies', text: 'Search the shared company list and contacts.' },
    { to: '/performance', title: 'Performance', text: 'Visits, deals won and the pipeline for 7, 30 or 90 days.' },
    ...(canRecordQuotations(user?.role) ? [{ to: '/quotation-requests', title: 'Quotation requests', text: 'Customers waiting for a quotation.' }] : []),
    ...(isAdminRole(user?.role)
      ? [
          { to: '/admin/salespeople', title: 'Salespeople', text: 'The people who own visits and deals.' },
          { to: '/admin/users', title: 'Users', text: 'Logins and roles.' },
          { to: '/admin/audit', title: 'Audit log', text: 'Every account and ownership change.' },
        ]
      : []),
  ];
  return (
    <div>
      <PageHeader title="More" />
      <ul className="flex flex-col gap-2">
        {links.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="block bg-white border border-line rounded-xl shadow-card px-4 py-3 hover:border-brand/40">
              <div className="text-sm font-semibold">{l.title}</div>
              <div className="text-xs text-ink-muted mt-0.5">{l.text}</div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
