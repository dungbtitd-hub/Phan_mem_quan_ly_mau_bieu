import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../api/client';
import type { CreatedUser, Paged, UserDto } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button, ConfirmDialog, EmptyState, ErrorBox, ErrorState, Field, Modal, PageHeader, Pagination, Spinner, StatusBadge, useToast } from '../components/ui';
import { ROLE_LABELS, fmtDateTime, useAsync, useDebounced } from '../util';

const ROLES = ['admin', 'approver', 'user'];

export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const page = Number(sp.get('page') ?? 1);
  const status = sp.get('status') ?? '';
  const role = sp.get('role') ?? '';
  const [q, setQ] = useState(sp.get('q') ?? '');
  const dq = useDebounced(q);
  const { data, loading, error, reload } = useAsync(() => api.get<Paged<UserDto>>(`/api/users${qs({ q: dq, status, role, page, pageSize: 20 })}`), [dq, status, role, page]);
  const [edit, setEdit] = useState<UserDto | 'new' | null>(null);
  const [rolesFor, setRolesFor] = useState<UserDto | null>(null);
  const [lock, setLock] = useState<UserDto | null>(null);
  const [reset, setReset] = useState<UserDto | null>(null);
  const [secret, setSecret] = useState<{ title: string; username: string; password: string } | null>(null);
  const setParam = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); setSp(n); };

  return (
    <>
      <PageHeader title="Quản lý người dùng"><Button variant="primary" onClick={() => setEdit('new')}>+ Tạo tài khoản</Button></PageHeader>
      <div className="toolbar">
        <Field label="Tìm kiếm" htmlFor="uq"><input id="uq" value={q} onChange={e => { setQ(e.target.value); setParam('page', ''); }} placeholder="Tên đăng nhập hoặc họ tên" maxLength={100} /></Field>
        <Field label="Trạng thái" htmlFor="us"><select id="us" value={status} onChange={e => setParam('status', e.target.value)}>
          <option value="">Tất cả</option><option value="active">Hoạt động</option><option value="locked">Đã khóa</option></select></Field>
        <Field label="Vai trò" htmlFor="ur"><select id="ur" value={role} onChange={e => setParam('role', e.target.value)}>
          <option value="">Tất cả</option>{ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></Field>
      </div>
      {loading && !data && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.items.length === 0 && <EmptyState text="Không có người dùng" />}
      {data && data.items.length > 0 && (
        <div className="table-wrap"><table>
          <thead><tr><th>Tên đăng nhập</th><th>Họ tên</th><th>Đơn vị</th><th>Vai trò</th><th>Trạng thái</th><th>Đăng nhập gần nhất</th><th>Thao tác</th></tr></thead>
          <tbody>{data.items.map(u => (
            <tr key={u.id}>
              <td className="mono">{u.username}</td><td>{u.fullName}<br /><span className="muted">{u.email ?? ''}</span></td><td>{u.unitName ?? '—'}</td>
              <td>{u.roles.map(r => ROLE_LABELS[r] ?? r).join(', ')}</td>
              <td><StatusBadge status={u.status} kind="user" />{u.lockedUntil && new Date(u.lockedUntil) > new Date() && <><br /><span className="badge badge-warn">▲ Tạm khóa đến {fmtDateTime(u.lockedUntil)}</span></>}</td>
              <td className="nowrap">{fmtDateTime(u.lastLoginAt)}</td>
              <td><div className="row-actions">
                <Button small onClick={() => setEdit(u)}>Sửa</Button>
                <Button small onClick={() => setRolesFor(u)}>Vai trò</Button>
                <Button small onClick={() => setReset(u)}>Đặt lại MK</Button>
                {u.id !== me?.id && <Button small variant={u.status === 'active' ? 'danger' : 'secondary'} onClick={() => setLock(u)}>{u.status === 'active' ? 'Khóa' : 'Mở khóa'}</Button>}
              </div></td>
            </tr>))}</tbody></table></div>
      )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={p => setParam('page', String(p))} />}

      {edit && <UserForm user={edit === 'new' ? null : edit} onClose={() => setEdit(null)}
        onSaved={created => { setEdit(null); reload(); toast('success', 'Đã lưu tài khoản'); if (created) setSecret({ title: 'Tài khoản đã được tạo', username: created.user.username, password: created.temporaryPassword }); }} />}
      {rolesFor && <RolesDialog user={rolesFor} onClose={() => setRolesFor(null)} onSaved={() => { setRolesFor(null); reload(); toast('success', 'Đã cập nhật vai trò'); }} />}
      {lock && <ConfirmDialog title={lock.status === 'active' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'} danger={lock.status === 'active'}
        confirmLabel={lock.status === 'active' ? 'Khóa' : 'Mở khóa'}
        message={lock.status === 'active' ? <>Khóa tài khoản <strong>{lock.username}</strong>? Người dùng sẽ bị đăng xuất và không đăng nhập được.</> : <>Mở khóa tài khoản <strong>{lock.username}</strong>?</>}
        onConfirm={async () => { await api.post(`/api/users/${lock.id}/${lock.status === 'active' ? 'lock' : 'unlock'}`); toast('success', 'Đã cập nhật'); reload(); }} onClose={() => setLock(null)} />}
      {reset && <ConfirmDialog title="Đặt lại mật khẩu" danger confirmLabel="Đặt lại"
        message={<>Tạo mật khẩu tạm thời mới cho <strong>{reset.username}</strong>? Mật khẩu cũ mất hiệu lực và người dùng phải đổi mật khẩu khi đăng nhập.</>}
        onConfirm={async () => { const r = await api.post<{ temporaryPassword: string }>(`/api/users/${reset.id}/reset-password`); setSecret({ title: 'Mật khẩu tạm thời mới', username: reset.username, password: r.temporaryPassword }); reload(); }}
        onClose={() => setReset(null)} />}
      {secret && <SecretDialog {...secret} onClose={() => setSecret(null)} />}
    </>
  );
}

function SecretDialog({ title, username, password, onClose }: { title: string; username: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(password); setCopied(true); } catch { setCopied(false); } };
  return (
    <Modal title={title} onClose={onClose}>
      <div className="stack">
        <div className="alert alert-warn" role="alert">▲ Mật khẩu chỉ hiển thị một lần. Hãy chuyển cho người dùng qua kênh an toàn; họ phải đổi mật khẩu ở lần đăng nhập đầu.</div>
        <dl className="kv"><dt>Tên đăng nhập</dt><dd className="mono">{username}</dd><dt>Mật khẩu tạm thời</dt><dd className="mono" style={{ fontSize: '1.1rem' }}>{password}</dd></dl>
        <div className="actions"><Button onClick={copy}>{copied ? '✓ Đã sao chép' : 'Sao chép mật khẩu'}</Button><Button variant="primary" onClick={onClose}>Đã lưu lại, đóng</Button></div>
      </div>
    </Modal>
  );
}

function UserForm({ user, onClose, onSaved }: { user: UserDto | null; onClose: () => void; onSaved: (created?: CreatedUser) => void }) {
  const [username, setUsername] = useState(user?.username ?? '');
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [unitName, setUnitName] = useState(user?.unitName ?? '');
  const [roles, setRoles] = useState<string[]>(['user']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const nameBad = username && !/^[A-Za-z0-9._@-]{3,100}$/.test(username) ? 'Tên đăng nhập gồm 3-100 ký tự chữ, số, . _ @ -' : null;
  const emailBad = email && !/^\S+@\S+\.\S+$/.test(email) ? 'Email không hợp lệ' : null;
  const toggle = (r: string) => setRoles(s => (s.includes(r) ? s.filter(x => x !== r) : [...s, r]));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      if (user) { await api.put(`/api/users/${user.id}`, { fullName: fullName.trim(), email: email.trim() || null, unitName: unitName.trim() || null }); onSaved(); }
      else onSaved(await api.post<CreatedUser>('/api/users', { username: username.trim(), fullName: fullName.trim(), email: email.trim() || null, unitName: unitName.trim() || null, roles }));
    } catch (err) { setError(err); setBusy(false); }
  };
  const valid = !!fullName.trim() && !emailBad && (!!user || (!!username && !nameBad && roles.length > 0));

  return (
    <Modal title={user ? 'Sửa tài khoản' : 'Tạo tài khoản'} onClose={() => { if (!busy) onClose(); }}>
      <form className="stack" onSubmit={submit} noValidate>
        <ErrorBox error={error} />
        <div className="form-grid">
          <Field label="Tên đăng nhập" htmlFor="x-u" required error={nameBad}><input id="x-u" value={username} onChange={e => setUsername(e.target.value)} disabled={!!user} maxLength={100} /></Field>
          <Field label="Họ và tên" htmlFor="x-n" required><input id="x-n" value={fullName} onChange={e => setFullName(e.target.value)} maxLength={200} /></Field>
          <Field label="Email" htmlFor="x-e" error={emailBad}><input id="x-e" type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={200} /></Field>
          <Field label="Đơn vị" htmlFor="x-o"><input id="x-o" value={unitName} onChange={e => setUnitName(e.target.value)} maxLength={200} /></Field>
        </div>
        {!user && <fieldset className="field" style={{ border: 0, padding: 0 }}><legend style={{ fontWeight: 700, fontSize: '.9rem' }}>Vai trò <span className="req" aria-hidden="true">*</span></legend>
          {ROLES.map(r => <label key={r}><input type="checkbox" checked={roles.includes(r)} onChange={() => toggle(r)} /> {ROLE_LABELS[r]}</label>)}
          <small className="hint">Hệ thống sẽ sinh mật khẩu tạm thời và hiển thị một lần sau khi tạo.</small></fieldset>}
        <div className="actions"><Button onClick={onClose} disabled={busy}>Hủy</Button><Button type="submit" variant="primary" loading={busy} disabled={!valid}>Lưu</Button></div>
      </form>
    </Modal>
  );
}

function RolesDialog({ user, onClose, onSaved }: { user: UserDto; onClose: () => void; onSaved: () => void }) {
  const [roles, setRoles] = useState<string[]>(user.roles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const toggle = (r: string) => setRoles(s => (s.includes(r) ? s.filter(x => x !== r) : [...s, r]));
  const save = async () => { setBusy(true); setError(null); try { await api.put(`/api/users/${user.id}/roles`, { roles }); onSaved(); } catch (e) { setError(e); setBusy(false); } };
  return (
    <Modal title={`Vai trò của ${user.username}`} onClose={() => { if (!busy) onClose(); }}>
      <div className="stack">
        <ErrorBox error={error} />
        {ROLES.map(r => <label key={r}><input type="checkbox" checked={roles.includes(r)} onChange={() => toggle(r)} /> {ROLE_LABELS[r]}</label>)}
        <small className="muted">Thay đổi vai trò có hiệu lực ngay ở lần thao tác tiếp theo của người dùng.</small>
        <div className="actions"><Button onClick={onClose} disabled={busy}>Hủy</Button><Button variant="primary" loading={busy} disabled={roles.length === 0} onClick={save}>Lưu</Button></div>
      </div>
    </Modal>
  );
}
