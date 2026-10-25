import { useMemo, useState, type FormEvent } from 'react';
import { api, fetchAll } from '../api/client';
import type { GroupDto, Target, UserDto } from '../api/types';
import { Button, EmptyState, ErrorBox, ErrorState, Field, Modal, PageHeader, Spinner, useToast } from '../components/ui';
import { useAsync } from '../util';

export default function Groups() {
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(() => api.get<GroupDto[]>('/api/groups'), []);
  const [edit, setEdit] = useState<GroupDto | 'new' | null>(null);
  const [members, setMembers] = useState<GroupDto | null>(null);

  return (
    <>
      <PageHeader title="Nhóm người dùng"><Button variant="primary" onClick={() => setEdit('new')}>+ Thêm nhóm</Button></PageHeader>
      {loading && !data && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.length === 0 && <EmptyState text="Chưa có nhóm nào" hint="Tạo nhóm để cấp quyền cho nhiều người dùng cùng lúc." />}
      {data && data.length > 0 && (
        <div className="table-wrap"><table>
          <thead><tr><th>Tên nhóm</th><th>Mô tả</th><th>Số thành viên</th><th>Thao tác</th></tr></thead>
          <tbody>{data.map(g => (
            <tr key={g.id}><td>{g.name}</td><td>{g.description ?? '—'}</td><td>{g.memberCount}</td>
              <td><div className="row-actions"><Button small onClick={() => setEdit(g)}>Sửa</Button><Button small onClick={() => setMembers(g)}>Thành viên</Button></div></td></tr>))}</tbody></table></div>
      )}
      {edit && <GroupForm group={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); toast('success', 'Đã lưu nhóm'); reload(); }} />}
      {members && <MembersDialog group={members} onClose={() => setMembers(null)} onSaved={() => { setMembers(null); toast('success', 'Đã cập nhật thành viên'); reload(); }} />}
    </>
  );
}

function GroupForm({ group, onClose, onSaved }: { group: GroupDto | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true); setError(null);
    const body = { name: name.trim(), description: description.trim() || null };
    try { if (group) await api.put(`/api/groups/${group.id}`, body); else await api.post('/api/groups', body); onSaved(); } catch (err) { setError(err); setBusy(false); }
  };
  return (
    <Modal title={group ? 'Sửa nhóm' : 'Thêm nhóm'} onClose={() => { if (!busy) onClose(); }}>
      <form className="stack" onSubmit={submit} noValidate>
        <ErrorBox error={error} />
        <Field label="Tên nhóm" htmlFor="g-n" required><input id="g-n" value={name} onChange={e => setName(e.target.value)} maxLength={150} /></Field>
        <Field label="Mô tả" htmlFor="g-d"><textarea id="g-d" rows={3} value={description} onChange={e => setDescription(e.target.value)} maxLength={500} /></Field>
        <div className="actions"><Button onClick={onClose} disabled={busy}>Hủy</Button><Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>Lưu</Button></div>
      </form>
    </Modal>
  );
}

function MembersDialog({ group, onClose, onSaved }: { group: GroupDto; onClose: () => void; onSaved: () => void }) {
  const state = useAsync(async () => {
    const [users, current] = await Promise.all([fetchAll<UserDto>('/api/users'), api.get<Target[]>(`/api/groups/${group.id}/members`)]);
    return { users, current };
  }, [group.id]);
  const [sel, setSel] = useState<Set<string> | null>(null);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const selected = sel ?? new Set((state.data?.current ?? []).map(t => t.id));
  const f = filter.trim().toLowerCase();
  const users = useMemo(() => (state.data?.users ?? []).filter(u => !f || u.fullName.toLowerCase().includes(f) || u.username.toLowerCase().includes(f)), [state.data, f]);
  const toggle = (id: string) => { const n = new Set(selected); if (n.has(id)) n.delete(id); else n.add(id); setSel(n); };
  const save = async () => { setBusy(true); setError(null); try { await api.put(`/api/groups/${group.id}/members`, { ids: [...selected] }); onSaved(); } catch (e) { setError(e); setBusy(false); } };

  return (
    <Modal title={`Thành viên nhóm: ${group.name}`} onClose={() => { if (!busy) onClose(); }}>
      {state.loading && <Spinner />}
      {state.error && <ErrorState error={state.error} onRetry={state.reload} />}
      {state.data && (
        <div className="stack">
          <ErrorBox error={error} />
          <Field label="Lọc người dùng" htmlFor="m-f"><input id="m-f" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Tên hoặc tên đăng nhập" /></Field>
          <div className="checklist">{users.map(u => <label key={u.id}><input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} /> {u.fullName} ({u.username})</label>)}
            {users.length === 0 && <span className="muted">Không có người dùng phù hợp</span>}</div>
          <div className="actions"><span className="muted">Đã chọn {selected.size}</span><Button onClick={onClose} disabled={busy}>Hủy</Button><Button variant="primary" loading={busy} onClick={save}>Lưu</Button></div>
        </div>
      )}
    </Modal>
  );
}
