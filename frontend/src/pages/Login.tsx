import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button, ErrorBox, Field } from '../components/ui';

export default function Login() {
  const { user, loading, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [logoOk, setLogoOk] = useState(true);
  const from = (loc.state as { from?: string } | null)?.from ?? '/';

  if (!loading && user) return <Navigate to={user.mustChangePassword ? '/change-password' : from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const me = await login(username.trim(), password);
      nav(me.mustChangePassword ? '/change-password' : from, { replace: true });
    } catch (err) {
      setError(err); setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card stack" onSubmit={submit} noValidate>
        <div className="login-brand">
          {logoOk ? <img className="brand-logo" src="/brand/logo.svg" alt="Logo" onError={() => setLogoOk(false)} />
            : <span className="brand-placeholder" aria-label="Vị trí logo chính thức">LOGO</span>}
        </div>
        <div>
          <h1>CỔNG QUẢN LÝ MẪU BIỂU ỨNG DỤNG</h1>
          <div className="sub">Đăng nhập để tiếp tục</div>
        </div>
        <ErrorBox error={error} />
        <Field label="Tên đăng nhập" htmlFor="u" required>
          <input id="u" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoFocus maxLength={100} required />
        </Field>
        <Field label="Mật khẩu" htmlFor="p" required>
          <input id="p" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" maxLength={200} required />
        </Field>
        <Button type="submit" variant="primary" loading={busy} disabled={!username.trim() || !password}>Đăng nhập</Button>
      </form>
    </div>
  );
}
