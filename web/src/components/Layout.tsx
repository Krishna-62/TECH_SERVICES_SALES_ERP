import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { syncOutbox, useOutbox } from '../lib/outbox';
import { useAuth } from '../lib/auth';
import { type Role, canRecordQuotations, isAdminRole, isManagingRole, roleLabel } from '../lib/roles';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  show?: (role: Role | undefined) => boolean;
  // Where it appears: phones get four tabs + More; the desktop sidebar lists everything else.
  placement: 'both' | 'desktop' | 'mobile';
}

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

const NAV: NavItem[] = [
  { to: '/', label: 'Today', placement: 'both', icon: icon('M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z') },
  { to: '/visits', label: 'Visits', placement: 'both', icon: icon('M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5') },
  { to: '/pipeline', label: 'Pipeline', placement: 'both', icon: icon('M3 5h18M6 12h12M10 19h4') },
  { to: '/tasks', label: 'Follow-ups', placement: 'both', icon: icon('M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9') },
  { to: '/companies', label: 'Companies', placement: 'desktop', icon: icon('M3 21h18M5 21V7l7-4 7 4v14M9 9h1M9 13h1M9 17h1M14 9h1M14 13h1M14 17h1') },
  { to: '/tenders', label: 'Tenders', placement: 'desktop', icon: icon('M9 3h6l1 3H8zM6 6h12a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1M9 12h6M9 16h4') },
  { to: '/renewals', label: 'Renewals', placement: 'desktop', icon: icon('M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5') },
  { to: '/products', label: 'Products', placement: 'desktop', icon: icon('M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8') },
  { to: '/performance', label: 'Performance', placement: 'desktop', icon: icon('M4 20V10M10 20V4M16 20v-7M22 20H2') },
  { to: '/analysis', label: 'Sales analysis', placement: 'desktop', icon: icon('M3 4h18l-7 8v6l-4 2v-8z') },
  { to: '/reports', label: 'Weekly report', placement: 'desktop', show: (role) => role !== undefined && role !== 'salesperson', icon: icon('M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 17v-3M12 17v-5M16 17v-2') },
  { to: '/team', label: 'Team', placement: 'desktop', show: (role) => role !== undefined && role !== 'salesperson', icon: icon('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8') },
  { to: '/quotation-requests', label: 'Quotation requests', placement: 'desktop', show: canRecordQuotations, icon: icon('M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5') },
  { to: '/approvals', label: 'Approvals', placement: 'desktop', show: isManagingRole, icon: icon('M9 12l2 2 4-4M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18') },
  { to: '/admin', label: 'Admin', placement: 'desktop', show: isAdminRole, icon: icon('M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7z') },
  { to: '/more', label: 'More', placement: 'mobile', icon: icon('M5 12h.01M12 12h.01M19 12h.01') },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/icon-64.png" alt="" className="w-8 h-8" />
      <div className="leading-tight">
        <div className="text-sm font-bold tracking-wide">TECHNICON</div>
        <div className="text-[10px] font-semibold tracking-[0.2em] text-accent-dark">SALES</div>
      </div>
    </div>
  );
}

function SyncBanner() {
  const { online, waiting, conflicts } = useOutbox();
  if (online && waiting === 0 && conflicts === 0) return null;
  const parts = [
    !online && 'Offline, showing what’s saved on this phone',
    waiting > 0 && `${waiting} change${waiting === 1 ? '' : 's'} waiting to send`,
    conflicts > 0 && `${conflicts} need${conflicts === 1 ? 's' : ''} a decision`,
  ].filter(Boolean);
  return (
    <Link to="/sync" className={`block px-4 py-2 text-xs font-semibold text-center ${conflicts ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent-dark'}`}>
      {parts.join(' · ')}
    </Link>
  );
}

function ReminderBell({ unread }: { unread: number }) {
  return (
    <Link to="/notifications" aria-label={unread ? `Reminders, ${unread} new` : 'Reminders'} className="relative inline-flex h-10 w-10 items-center justify-center text-ink-muted hover:text-ink shrink-0">
      {icon('M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a2 2 0 0 0 3.4 0')}
      {unread > 0 && <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-accent text-white text-[10px] font-bold leading-4 text-center">{unread}</span>}
    </Link>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [unread, setUnread] = useState(0);

  // Sends anything waiting when the app comes back into view, and every few minutes while it's open.
  useEffect(() => {
    const send = () => {
      if (document.visibilityState === 'visible') void syncOutbox();
    };
    document.addEventListener('visibilitychange', send);
    const timer = setInterval(send, 3 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', send);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const check = () => api.notifications.list().then((n) => setUnread(n.unread)).catch(() => undefined);
    void check();
    const cleared = () => setUnread(0);
    window.addEventListener('notifications-read', cleared);
    return () => window.removeEventListener('notifications-read', cleared);
  }, [location.pathname]);

  const visible = NAV.filter((item) => !item.show || item.show(user?.role));
  const sidebarItems = visible.filter((item) => item.placement !== 'mobile');
  const tabItems = visible.filter((item) => item.placement !== 'desktop');
  const showBottomNav = tabItems.length > 1;

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden print:!hidden lg:flex lg:flex-col w-60 shrink-0 border-r border-line bg-white px-4 py-5 sticky top-0 h-screen">
        <Brand />
        <nav className="mt-8 flex flex-col gap-1" aria-label="Main">
          {sidebarItems.map((item) => (
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
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold truncate">{user?.username}</div>
            <ReminderBell unread={unread} />
          </div>
          <div className="text-xs text-ink-faint">{roleLabel(user?.role)}</div>
          <button type="button" onClick={logout} className="mt-3 text-xs font-semibold text-ink-muted hover:text-danger">
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <header className="lg:hidden print:hidden sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-white/95 backdrop-blur px-4 h-14">
          <Brand />
          <div className="flex items-center gap-1 min-w-0">
            <ReminderBell unread={unread} />
            <div className="text-right min-w-0 mr-1">
              <div className="text-xs font-semibold truncate">{user?.username}</div>
              <div className="text-[11px] text-ink-faint">{roleLabel(user?.role)}</div>
            </div>
            <button type="button" onClick={logout} className="text-xs font-semibold text-ink-muted hover:text-danger shrink-0">
              Sign out
            </button>
          </div>
        </header>

        <SyncBanner />
        <main className={`flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-8 ${showBottomNav ? 'pb-24 lg:pb-8' : ''}`}>
          <Outlet />
        </main>

        {/* Mobile bottom tabs */}
        {showBottomNav && (
          <nav
            aria-label="Main"
            className="lg:hidden print:hidden fixed bottom-0 inset-x-0 z-20 border-t border-line bg-white grid pb-[env(safe-area-inset-bottom)]"
            style={{ gridTemplateColumns: `repeat(${tabItems.length}, minmax(0, 1fr))` }}
          >
            {tabItems.map((item) => (
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
