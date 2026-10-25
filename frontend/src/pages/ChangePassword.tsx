import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, resetCsrf } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button, ErrorBox, Field, useToast } from '../components/ui';

export function passwordProblem(pw: string, username: string): string | null {
  if (pw.length < 10) return 'Mật khẩu phải có ít nhất 10 ký tự';
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(pw)).length;
  if (classes < 3) return 'Cần ít nhất 3 trong 4 loại: chữ thường, chữ hoa, chữ số, ký tự đặc biệt';
  if (username.length >= 3 && pw.toLowerCase().includes(username.toLowerCase())) return 'Mật khẩu không được chứa tên đăng nhập';
  return null;
}

export default function ChangePassword() {
  const { user, refresh, logout } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const forced = !!user?.mustChangePassword;
  const problem = pw ? passwordProblem(pw, user?.username ?? '') : null;
  const mismatch = pw2 && pw !== pw2 ? 'Mật khẩu nhập lại không khớp' : null;
  const valid = !!cur && !!pw && !problem && pw === pw2;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !valid) return;
    setBusy(true); setError(null);
    try {
      await api.post('/api/auth/change-password', { currentPassword: cur, newPassword: pw });
      resetCsrf();
      await refresh();
      toast('success', 'Đã đổi mật khẩu');
      nav('/', { replace: true });
    } catch (err) { setError(err); setBusy(false); }
  };

  return (
    <div className="login-page">
      <form className="login-card stack" onSubmit={submit} noValidate>
        <h1>Đổi mật khẩu</h1>
        {forced && <div className="alert alert-warn" role="status">Bạn cần đổi mật khẩu trước khi sử dụng hệ thống.</div>}
        <ErrorBox error={error} />
        <Field label="Mật khẩu hiện tại" htmlFor="cur" required>
          <input id="cur" type="password" value={cur} onChange={e => setCur(e.target.value)} autoComplete="current-password" maxLength={200} />
        </Field>
        <Field label="Mật khẩu mới" htmlFor="pw" required error={problem} hint="Ít nhất 10 ký tự, gồm 3 trong 4 loại: chữ thường, chữ hoa, chữ số, ký tự đặc biệt">
          <input id="pw" type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" maxLength={128} />
        </Field>
        <Field label="Nhập lại mật khẩu mới" htmlFor="pw2" required error={mismatch}>
          <input id="pw2" type="password" value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password" maxLength={128} />
        </Field>
        <div className="actions">
          <Button type="submit" variant="primary" loading={busy} disabled={!valid}>Đổi mật khẩu</Button>
          {forced
            ? <Button onClick={() => { void logout().then(() => nav('/login')); }}>Đăng xuất</Button>
            : <Button onClick={() => nav(-1)}>Hủy</Button>}
        </div>
      </form>
    </div>
  );
}
