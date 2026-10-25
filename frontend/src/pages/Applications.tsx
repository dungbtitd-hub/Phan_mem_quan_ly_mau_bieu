import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, fetchAll, qs } from '../api/client';
import type { ApplicationDto, Paged, Permissions, Target, UserDto, GroupDto } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button, ConfirmDialog, EmptyState, ErrorBox, ErrorState, Field, Modal, PageHeader, Pagination, Spinner, StatusBadge, useToast } from '../components/ui';
import { fmtDate, useAsync, useDebounced } from '../util';

export default function Applications() {
  const { hasRole } = useAuth();
  const admin = hasRole('admin');
  const privileged = admin || hasRole('approver');
  const [sp, setSp] = useSearchParams();
  const page = Number(sp.get('page') ?? 1);
  const [q, setQ] = useState(sp.get('q') ?? '');
  const dq = useDebounced(q);
  const status = sp.get('status') ?? '';
  const [edit, setEdit] = useState<ApplicationDto | 'new' | null>(null);
  const [perm, setPerm] = useState<ApplicationDto | null>(null);
  const [lock, setLock] = useState<ApplicationDto | null>(null);
  const toast = useToast();

  const { data, loading, error, reload } = useAsync(
    () => api.get<Paged<ApplicationDto>>(`/api/applications${qs({ q: dq, status, page, pageSize: 20 })}`), [dq, status, page]);
  const setParam = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); setSp(n); };

  return (
    <>
      <PageHeader title={admin ? 'Quản lý hệ thống ứng dụng' : 'Hệ thống ứng dụng'}>
        {admin && <Button variant="primary" onClick={() => setEdit('new')}>+ Thêm mới</Button>}
      </PageHeader>
      <div className="toolbar">
        <Field label="Tìm kiếm" htmlFor="aq"><input id="aq" value={q} onChange={e => { setQ(e.target.value); setParam('page', ''); }} placeholder="Mã hoặc tên hệ thống" maxLength={100} /></Field>
        {privileged && <Field label="Trạng thái" htmlFor="as">
          <select id="as" value={status} onChange={e => setParam('status', e.target.value)}>
            <option value="">Tất cả</option><option value="active">Hoạt động</option><option value="locked">Đã khóa</option></select></Field>}
      </div>
      {loading && !data && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.items.length === 0 && <EmptyState text="Không có hệ thống ứng dụng" hint={admin ? 'Nhấn “Thêm mới” để tạo hệ thống đầu tiên.' : 'Bạn chưa được cấp quyền truy cập hệ thống nào.'} />}
      {data && data.items.length > 0 && (admin ? (
        <div className="table-wrap"><table>
          <thead><tr><th>Mã</th><th>Tên hệ thống</th><th>Mô tả</th><th>Số mẫu biểu</th><th>Người quản lý</th><th>Trạng thái</th><th>Tạo / cập nhật</th><th>Thao tác</th></tr></thead>
          <tbody>{data.items.map(a => (
            <tr key={a.id}>
              <td className="mono">{a.code}{a.isDemo && <> <span className="badge badge-demo">Minh họa</span></>}</td>
              <td>{a.name}</td><td>{a.description ?? '—'}</td>
              <td>{a.formCount}</td><td>{a.managerName ?? '—'}</td><td><StatusBadge status={a.status} kind="app" /></td>
              <td className="nowrap">{fmtDate(a.createdAt)}<br /><span className="muted">{fmtDate(a.updatedAt)}</span></td>
              <td><div className="row-actions">
                <Link className="btn btn-sm" to={`/forms?applicationId=${a.id}`}>Xem chi tiết</Link>
                <Button small onClick={() => setEdit(a)}>Sửa</Button>
                <Button small onClick={() => setPerm(a)}>Phân quyền</Button>
                <Button small variant={a.status === 'active' ? 'danger' : 'secondary'} onClick={() => setLock(a)}>{a.status === 'active' ? 'Khóa' : 'Mở khóa'}</Button>
              </div></td>
            </tr>))}</tbody></table></div>
      ) : (
        <div className="grid grid-cards">{data.items.map(a => (
          <div key={a.id} className="card app-card">
            <strong>{a.name}</strong><span className="muted mono">{a.code}</span>
            <p>{a.description ?? 'Chưa có mô tả'}</p>
            <span>{a.formCount} mẫu biểu {a.status === 'locked' && <StatusBadge status="locked" kind="app" />}</span>
            <Link className="btn btn-primary" to={`/forms?applicationId=${a.id}`}>Xem mẫu biểu</Link>
          </div>))}</div>
      ))}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={p => setParam('page', String(p))} />}

      {edit && <AppForm app={edit === 'new' ? null : edit} onClose={() => setEdit(null)}
        onSaved={() => { setEdit(null); toast('success', 'Đã lưu hệ thống ứng dụng'); reload(); }} />}
      {perm && <PermissionsDialog app={perm} onClose={() => setPerm(null)} onSaved={() => { setPerm(null); toast('success', 'Đã cập nhật phân quyền'); }} />}
      {lock && <ConfirmDialog title={lock.status === 'active' ? 'Khóa hệ thống ứng dụng' : 'Mở khóa hệ thống ứng dụng'} danger={lock.status === 'active'}
        confirmLabel={lock.status === 'active' ? 'Khóa' : 'Mở khóa'}
        message={lock.status === 'active'
          ? <>Khóa <strong>{lock.name}</strong>? Người dùng thường sẽ không còn thấy hệ thống này và mẫu biểu của nó.</>
          : <>Mở khóa <strong>{lock.name}</strong>?</>}
        onConfirm={async () => { await api.post(`/api/applications/${lock.id}/${lock.status === 'active' ? 'lock' : 'unlock'}`); toast('success', 'Đã cập nhật trạng thái'); reload(); }}
        onClose={() => setLock(null)} />}
    </>
  );
}

function AppForm({ app, onClose, onSaved }: { app: ApplicationDto | null; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(app?.code ?? '');
  const [name, setName] = useState(app?.name ?? '');
  const [description, setDescription] = useState(app?.description ?? '');
  const [ownerUnit, setOwnerUnit] = useState(app?.ownerUnit ?? '');
  const [managerId, setManagerId] = useState(app?.managerId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const users = useAsync(() => fetchAll<UserDto>('/api/users'), []);
  const codeBad = code && !/^[A-Za-z0-9._-]{1,50}$/.test(code) ? 'Mã gồm 1-50 ký tự chữ, số, dấu . _ -' : null;
  const locked = !!app && app.formCount > 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || codeBad || !code || !name.trim()) return;
    setBusy(true); setError(null);
    const body = { code: code.trim(), name: name.trim(), description: description.trim() || null, ownerUnit: ownerUnit.trim() || null, managerId: managerId || null };
    try { if (app) await api.put(`/api/applications/${app.id}`, body); else await api.post('/api/applications', body); onSaved(); }
    catch (err) { setError(err); setBusy(false); }
  };

  return (
    <Modal title={app ? 'Sửa hệ thống ứng dụng' : 'Thêm hệ thống ứng dụng'} onClose={() => { if (!busy) onClose(); }}>
      <form className="stack" onSubmit={submit} noValidate>
        <ErrorBox error={error} />
        <div className="form-grid">
          <Field label="Mã hệ thống" htmlFor="ac" required error={codeBad} hint={locked ? 'Không đổi được mã khi hệ thống đã có mẫu biểu' : undefined}>
            <input id="ac" value={code} onChange={e => setCode(e.target.value)} disabled={locked} maxLength={50} /></Field>
          <Field label="Tên hệ thống" htmlFor="an" required><input id="an" value={name} onChange={e => setName(e.target.value)} maxLength={200} /></Field>
          <Field label="Đơn vị quản lý" htmlFor="ao"><input id="ao" value={ownerUnit} onChange={e => setOwnerUnit(e.target.value)} maxLength={200} /></Field>
          <Field label="Người quản lý" htmlFor="am">
            <select id="am" value={managerId} onChange={e => setManagerId(e.target.value)}>
              <option value="">— Chưa chọn —</option>
              {(users.data ?? []).map(u => <option key={u.id} value={u.id}>{u.fullName} ({u.username})</option>)}</select></Field>
          <div className="span-all"><Field label="Mô tả" htmlFor="ad"><textarea id="ad" rows={3} value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} /></Field></div>
        </div>
        <div className="actions"><Button onClick={onClose} disabled={busy}>Hủy</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!code || !name.trim() || !!codeBad}>Lưu</Button></div>
      </form>
    </Modal>
  );
}

function PermissionsDialog({ app, onClose, onSaved }: { app: ApplicationDto; onClose: () => void; onSaved: () => void }) {
  const state = useAsync(async () => {
    const [users, groups, perms] = await Promise.all([
      fetchAll<UserDto>('/api/users'), api.get<GroupDto[]>('/api/groups'), api.get<Permissions>(`/api/applications/${app.id}/permissions`)]);
    return { users, groups, perms };
  }, [app.id]);
  const [selUsers, setSelUsers] = useState<Set<string> | null>(null);
  const [selGroups, setSelGroups] = useState<Set<string> | null>(null);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const su = selUsers ?? new Set((state.data?.perms.users ?? []).map((t: Target) => t.id));
  const sg = selGroups ?? new Set((state.data?.perms.groups ?? []).map((t: Target) => t.id));
  const f = filter.trim().toLowerCase();
  const users = useMemo(() => (state.data?.users ?? []).filter(u => !f || u.fullName.toLowerCase().includes(f) || u.username.toLowerCase().includes(f)), [state.data, f]);
  const toggle = (set: Set<string>, id: string, apply: (s: Set<string>) => void) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); apply(n); };

  const save = async () => {
    setBusy(true); setError(null);
    try { await api.put(`/api/applications/${app.id}/permissions`, { userIds: [...su], groupIds: [...sg] }); onSaved(); }
    catch (err) { setError(err); setBusy(false); }
  };

  return (
    <Modal title={`Phân quyền xem: ${app.name}`} onClose={() => { if (!busy) onClose(); }} wide>
      {state.loading && <Spinner />}
      {state.error && <ErrorState error={state.error} onRetry={state.reload} />}
      {state.data && (
        <div className="stack">
          <p className="muted">Chọn người dùng hoặc nhóm được phép xem và tải mẫu biểu của hệ thống này. Danh sách mới sẽ thay thế toàn bộ phân quyền hiện có.</p>
          <ErrorBox error={error} />
          <div className="grid grid-2" style={{ marginBottom: 0 }}>
            <div><Field label="Nhóm người dùng"><div className="checklist">
              {state.data.groups.length === 0 && <span className="muted">Chưa có nhóm</span>}
              {state.data.groups.map(g => <label key={g.id}><input type="checkbox" checked={sg.has(g.id)} onChange={() => toggle(sg, g.id, setSelGroups)} /> {g.name} ({g.memberCount})</label>)}
            </div></Field></div>
            <div><Field label="Người dùng" htmlFor="pf">
              <input id="pf" placeholder="Lọc theo tên" value={filter} onChange={e => setFilter(e.target.value)} />
              <div className="checklist">{users.map(u => <label key={u.id}><input type="checkbox" checked={su.has(u.id)} onChange={() => toggle(su, u.id, setSelUsers)} /> {u.fullName} ({u.username})</label>)}
                {users.length === 0 && <span className="muted">Không có người dùng phù hợp</span>}</div></Field></div>
          </div>
          <div className="actions"><span className="muted">Đã chọn {su.size} người dùng, {sg.size} nhóm</span><Button onClick={onClose} disabled={busy}>Hủy</Button>
            <Button variant="primary" loading={busy} onClick={save}>Lưu phân quyền</Button></div>
        </div>
      )}
    </Modal>
  );
}
