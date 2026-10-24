import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { isAdminRole } from '../lib/roles';
import { Card } from '../components/ui';

// Landing page. Visits, follow-ups and the pipeline arrive in the next phases; until then this
// tells each role what is ready.
export default function Today() {
  const { user } = useAuth();
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const unlinkedSalesperson = user?.role === 'salesperson' && !user.salesperson_id;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="text-sm text-ink-muted">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 className="text-2xl font-bold tracking-tight mt-0.5">
          {greeting}, {user?.username}
        </h1>
      </header>

      {unlinkedSalesperson && (
        <Card className="p-4 border-danger/30 bg-danger-soft">
          <p className="text-sm text-danger font-semibold">Your login isn't linked to a salesperson record yet. Ask your administrator.</p>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="text-base font-semibold">Field sales is coming here</h2>
        <p className="text-sm text-ink-muted mt-1 leading-relaxed">
          Company visits, customer requirements, follow-ups and your pipeline will appear on this screen. Your account is
          ready — you don't need to do anything for now.
        </p>
      </Card>

      {isAdminRole(user?.role) && (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { to: '/admin/salespeople', title: 'Salespeople', text: 'Add the people who will own visits and deals.' },
            { to: '/admin/users', title: 'Users', text: 'Give each person a login and a role.' },
            { to: '/admin/audit', title: 'Audit log', text: 'See every account and ownership change.' },
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="block bg-white border border-line rounded-xl shadow-card p-4 hover:border-brand/40 transition-colors"
            >
              <div className="text-sm font-semibold">{item.title}</div>
              <div className="text-xs text-ink-muted mt-1">{item.text}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
