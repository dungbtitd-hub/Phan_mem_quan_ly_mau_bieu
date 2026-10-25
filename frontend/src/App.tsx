import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import AdminDashboard from './pages/AdminDashboard';
import UserHome from './pages/UserHome';
import Applications from './pages/Applications';
import Forms from './pages/Forms';
import FormNew from './pages/FormNew';
import FormDetail from './pages/FormDetail';
import Approvals from './pages/Approvals';
import Users from './pages/Users';
import Groups from './pages/Groups';
import AuditLogs from './pages/AuditLogs';
import Reports from './pages/Reports';
import { Account, Help, NotFound } from './pages/Misc';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (user.mustChangePassword && loc.pathname !== '/change-password') return <Navigate to="/change-password" replace />;
  return <>{children}</>;
}

function RequireRole({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !user.roles.some(r => roles.includes(r))) {
    return <div className="state state-error" role="alert"><strong>Không có quyền truy cập</strong><span>Tài khoản của bạn không được phép xem trang này.</span></div>;
  }
  return <>{children}</>;
}

function Home() {
  const { hasRole } = useAuth();
  return hasRole('admin') ? <AdminDashboard /> : <UserHome />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/change-password" element={<RequireAuth><ChangePassword /></RequireAuth>} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Home />} />
        <Route path="applications" element={<Applications />} />
        <Route path="forms" element={<Forms />} />
        <Route path="forms/new" element={<RequireRole roles={['admin']}><FormNew /></RequireRole>} />
        <Route path="forms/:id" element={<FormDetail />} />
        <Route path="approvals" element={<RequireRole roles={['admin', 'approver']}><Approvals /></RequireRole>} />
        <Route path="users" element={<RequireRole roles={['admin']}><Users /></RequireRole>} />
        <Route path="groups" element={<RequireRole roles={['admin']}><Groups /></RequireRole>} />
        <Route path="audit" element={<RequireRole roles={['admin']}><AuditLogs /></RequireRole>} />
        <Route path="reports" element={<RequireRole roles={['admin']}><Reports /></RequireRole>} />
        <Route path="help" element={<Help />} />
        <Route path="account" element={<Account />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
