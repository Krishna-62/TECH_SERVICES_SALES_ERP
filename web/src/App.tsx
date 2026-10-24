import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { isAdminRole } from './lib/roles';
import Layout from './components/Layout';
import SignIn from './pages/SignIn';
import Today from './pages/Today';
import Users from './pages/admin/Users';
import Salespeople from './pages/admin/Salespeople';
import AuditLog from './pages/admin/AuditLog';

export default function App() {
  const { user, needsSetup, loading } = useAuth();

  if (loading) return <p className="p-6 text-sm text-ink-faint">Loading…</p>;
  if (needsSetup) return <SignIn mode="setup" />;
  if (!user) return <SignIn mode="login" />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Today />} />
        {isAdminRole(user.role) && (
          <>
            <Route path="admin/users" element={<Users />} />
            <Route path="admin/salespeople" element={<Salespeople />} />
            <Route path="admin/audit" element={<AuditLog />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
