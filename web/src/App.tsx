import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { canRecordQuotations, canWriteCrm, isAdminRole } from './lib/roles';
import Layout from './components/Layout';
import SignIn from './pages/SignIn';
import Today from './pages/Today';
import Visits from './pages/visits/Visits';
import NewVisit from './pages/visits/NewVisit';
import VisitDetail from './pages/visits/VisitDetail';
import Companies from './pages/companies/Companies';
import CompanyDetail from './pages/companies/CompanyDetail';
import Tasks from './pages/tasks/Tasks';
import Pipeline from './pages/pipeline/Pipeline';
import DealDetail from './pages/pipeline/DealDetail';
import QuotationQueue from './pages/pipeline/QuotationQueue';
import Performance from './pages/Performance';
import More from './pages/More';
import AdminHome from './pages/admin/AdminHome';
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
        <Route path="visits" element={<Visits />} />
        {canWriteCrm(user.role) && <Route path="visits/new" element={<NewVisit />} />}
        <Route path="visits/:id" element={<VisitDetail />} />
        <Route path="companies" element={<Companies />} />
        <Route path="companies/:id" element={<CompanyDetail />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="pipeline" element={<Pipeline />} />
        <Route path="pipeline/:id" element={<DealDetail />} />
        <Route path="performance" element={<Performance />} />
        <Route path="more" element={<More />} />
        {canRecordQuotations(user.role) && <Route path="quotation-requests" element={<QuotationQueue />} />}
        {isAdminRole(user.role) && (
          <>
            <Route path="admin" element={<AdminHome />} />
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
