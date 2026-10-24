import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { isAdminRole, roleLabel } from '../lib/roles';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

const NAV: NavItem[] = [
  { to: '/', label: 'Today', icon: icon('M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z') },
  { to: '/admin/users', label: 'Users', adminOnly: true, icon: icon('M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8') },
  { to: '/admin/salespeople', label: 'Salespeople', adminOnly: true, icon: icon('M20 7h-4V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1zM10 5h4v2h-4z') },
  { to: '/admin/audit', label: 'Audit log', adminOnly: true, icon: icon('M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 13h6M9 17h4') },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/icon.svg" alt="" className="w-8 h-8" />
      <div className="leading-tight">
        <div className="text-sm font-bold tracking-wide">TECHNICON</div>
        <div className="text-[10px] font-semibold tracking-[0.2em] text-ink-faint">SALES</div>
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const items = NAV.filter((item) => !item.adminOnly || isAdminRole(user?.role));
  const showBottomNav = items.length > 1;

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 border-r border-line bg-white px-4 py-5 sticky top-0 h-screen">
        <Brand />
        <nav className="mt-8 flex flex-col gap-1" aria-label="Main">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  isActive ? 'bg-brand-soft text-brand' : 'text-ink-muted hover:bg-canvas hover:text-ink'
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-line pt-4">
          <div className="text-sm font-semibold truncate">{user?.username}</div>
          <div className="text-xs text-ink-faint">{roleLabel(user?.role)}</div>
          <button type="button" onClick={logout} className="mt-3 text-xs font-semibold text-ink-muted hover:text-danger">
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-white/95 backdrop-blur px-4 h-14">
          <Brand />
          <div className="flex items-center gap-3 min-w-0">
            <div className="text-right min-w-0">
              <div className="text-xs font-semibold truncate">{user?.username}</div>
              <div className="text-[11px] text-ink-faint">{roleLabel(user?.role)}</div>
            </div>
            <button type="button" onClick={logout} className="text-xs font-semibold text-ink-muted hover:text-danger shrink-0">
              Sign out
            </button>
          </div>
        </header>

        <main className={`flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-8 ${showBottomNav ? 'pb-24 lg:pb-8' : ''}`}>
          <Outlet />
        </main>

        {/* Mobile bottom tabs */}
        {showBottomNav && (
          <nav
            aria-label="Main"
            className="lg:hidden fixed bottom-0 inset-x-0 z-20 border-t border-line bg-white grid pb-[env(safe-area-inset-bottom)]"
            style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
          >
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-0.5 h-16 text-[11px] font-semibold ${isActive ? 'text-brand' : 'text-ink-faint'}`
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
