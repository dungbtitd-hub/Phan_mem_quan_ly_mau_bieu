import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, downloadFile } from '../api/client';
import type { FormDto, FormType, HistoryDto, VersionDto } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button, ConfirmDialog, EmptyState, ErrorBox, ErrorState, Field, Modal, PageHeader, Spinner, StatusBadge, useToast } from '../components/ui';
import { checkFile, fmtBytes, fmtDate, fmtDateTime, useAsync } from '../util';

const ACTION_LABELS: Record<string, string> = { submit: 'Gửi phê duyệt', approve: 'Phê duyệt', reject: 'Từ chối', revoke: 'Thu hồi', expire: 'Hết hiệu lực' };

export default function FormDetail() {
  const { id = '' } = useParams();
  const { hasRole } = useAuth();
  const admin = hasRole('admin');
  const approver = hasRole('approver');
  const privileged = admin || approver;
  const toast = useToast();
  const form = useAsync(() => api.get<FormDto>(`/api/forms/${id}`), [id]);
  const versions = useAsync(() => privileged ? api.get<VersionDto[]>(`/api/forms/${id}/versions`) : Promise.resolve([] as VersionDto[]), [id, privileged]);
  const [dlBusy, setDlBusy] = useState<string | null>(null);
  const [editInfo, setEditInfo] = useState(false);
  const [newVersion, setNewVersion] = useState(false);
  const [editDraft, setEditDraft] = useState<VersionDto | null>(null);
  const [history, setHistory] = useState<VersionDto | null>(null);
  const [action, setAction] = useState<{ v: VersionDto; kind: 'submit' | 'approve' | 'reject' | 'revoke' } | null>(null);

  const reloadAll = () => { form.reload(); versions.reload(); };
  const download = async (url: string, key: string) => {
    setDlBusy(key);
    try { await downloadFile(url); } catch (e) { toast('error', e instanceof Error ? e.message : 'Không tải được tệp'); } finally { setDlBusy(null); }
  };

  if (form.loading && !form.data) return <Spinner />;
  if (form.error) return <ErrorState error={form.error} onRetry={form.reload} />;
  const f = form.data;
  if (!f) return null;
  const cur = f.current;
  const expiringSoon = cur?.expiryDate && cur.expiryDate <= new Date(Date.now() + 7 * 3600e3 + 30 * 86400e3).toISOString().slice(0, 10);
  const inProgress = (versions.data ?? []).some(v => v.status === 'draft' || v.status === 'pending');

  return (
    <>
      <PageHeader title={`${f.code} · ${f.name}`}>
        {admin && <Button onClick={() => setEditInfo(true)}>Chỉnh sửa thông tin</Button>}
        {admin && <Button onClick={() => setNewVersion(true)} disabled={inProgress} title={inProgress ? 'Đang có phiên bản bản nháp hoặc chờ phê duyệt' : undefined}>+ Phiên bản mới</Button>}
        <Button variant="primary" disabled={!cur || cur.status !== 'active'} loading={dlBusy === 'current'} onClick={() => download(`/api/forms/${f.id}/download`, 'current')}>Tải xuống bản hiện hành</Button>
      </PageHeader>

      {expiringSoon && cur && <div className="alert alert-warn" role="status" style={{ marginBottom: 12 }}>▲ Phiên bản hiện hành hết hiệu lực ngày {fmtDate(cur.expiryDate)}.</div>}
      {!cur && <div className="alert alert-warn" role="status" style={{ marginBottom: 12 }}>▲ Mẫu biểu chưa có phiên bản đang hiệu lực.</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <dl className="kv">
          <dt>Hệ thống ứng dụng</dt><dd>{f.applicationName} <span className="muted mono">({f.applicationCode})</span></dd>
          <dt>Loại mẫu biểu</dt><dd>{f.formTypeName ?? '—'}</dd>
          <dt>Mô tả</dt><dd>{f.description ?? '—'}</dd>
          <dt>Phiên bản hiện hành</dt><dd>{cur ? <>v{cur.versionNo} · hiệu lực {fmtDate(cur.effectiveDate)}{cur.expiryDate ? ` · hết hạn ${fmtDate(cur.expiryDate)}` : ' · không thời hạn'}</> : 'Chưa có'}</dd>
          <dt>Cập nhật lần cuối</dt><dd>{fmtDateTime(f.updatedAt)}</dd>
        </dl>
      </div>

      {privileged && (
        <>
          <h2 style={{ marginBottom: 10 }}>Lịch sử phiên bản</h2>
          {versions.loading && !versions.data && <Spinner />}
          {versions.error && <ErrorState error={versions.error} onRetry={versions.reload} />}
          {versions.data && versions.data.length === 0 && <EmptyState text="Chưa có phiên bản" />}
          {versions.data && versions.data.length > 0 && (
            <div className="table-wrap"><table>
              <thead><tr><th>Phiên bản</th><th>Tệp</th><th>Hiệu lực</th><th>Trạng thái</th><th>Người tạo / duyệt</th><th>Ghi chú</th><th>Thao tác</th></tr></thead>
              <tbody>{versions.data.map(v => (
                <tr key={v.id}>
                  <td>v{v.versionNo}<br />{v.isCurrent ? <span className="badge badge-ok">Hiện hành</span> : <span className="badge badge-muted">Phiên bản cũ</span>}</td>
                  <td>{v.originalFileName}<br /><span className="muted">{fmtBytes(v.sizeBytes)}</span><br /><span className="mono muted" title="SHA-256">{v.sha256.slice(0, 12)}…</span></td>
                  <td className="nowrap">{fmtDate(v.effectiveDate)}<br /><span className="muted">{v.expiryDate ? `đến ${fmtDate(v.expiryDate)}` : 'không thời hạn'}</span></td>
                  <td><StatusBadge status={v.status} /></td>
                  <td>{v.createdByName}<br /><span className="muted">{fmtDateTime(v.createdAt)}</span>{v.approvedByName && <><br />Duyệt: {v.approvedByName}<br /><span className="muted">{fmtDateTime(v.approvedAt)}</span></>}</td>
                  <td>{v.changeNote ?? '—'}</td>
                  <td><div className="row-actions">
                    <Button small onClick={() => download(`/api/versions/${v.id}/download`, v.id)} loading={dlBusy === v.id}>Tải</Button>
                    <Button small onClick={() => setHistory(v)}>Lịch sử</Button>
                    {admin && v.status === 'draft' && <><Button small onClick={() => setEditDraft(v)}>Sửa</Button><Button small variant="primary" onClick={() => setAction({ v, kind: 'submit' })}>Gửi phê duyệt</Button></>}
                    {approver && v.status === 'pending' && <><Button small variant="primary" onClick={() => setAction({ v, kind: 'approve' })}>Phê duyệt</Button><Button small variant="danger" onClick={() => setAction({ v, kind: 'reject' })}>Từ chối</Button></>}
                    {privileged && v.status === 'active' && <Button small variant="danger" onClick={() => setAction({ v, kind: 'revoke' })}>Thu hồi</Button>}
                  </div></td>
                </tr>))}</tbody></table></div>
          )}
        </>
      )}

      {editInfo && <EditInfo form={f} onClose={() => setEditInfo(false)} onSaved={() => { setEditInfo(false); toast('success', 'Đã cập nhật thông tin'); reloadAll(); }} />}
      {newVersion && <NewVersion formId={f.id} onClose={() => setNewVersion(false)} onSaved={() => { setNewVersion(false); toast('success', 'Đã tạo phiên bản mới (bản nháp)'); reloadAll(); }} />}
      {editDraft && <EditDraft v={editDraft} onClose={() => setEditDraft(null)} onSaved={() => { setEditDraft(null); toast('success', 'Đã cập nhật bản nháp'); reloadAll(); }} />}
      {history && <HistoryDialog v={history} onClose={() => setHistory(null)} />}
      {action && <ConfirmDialog
        title={{ submit: 'Gửi phê duyệt', approve: 'Phê duyệt phiên bản', reject: 'Từ chối phiên bản', revoke: 'Thu hồi phiên bản' }[action.kind]}
        danger={action.kind === 'reject' || action.kind === 'revoke'} withReason={action.kind === 'reject' || action.kind === 'revoke'}
        confirmLabel={{ submit: 'Gửi phê duyệt', approve: 'Phê duyệt', reject: 'Từ chối', revoke: 'Thu hồi' }[action.kind]}
        message={action.kind === 'approve'
          ? <>Phê duyệt <strong>v{action.v.versionNo}</strong>? Phiên bản đang hiệu lực hiện tại (nếu có) sẽ chuyển sang “Hết hiệu lực” và bản này có hiệu lực ngay.</>
          : action.kind === 'submit' ? <>Gửi <strong>v{action.v.versionNo}</strong> cho người phê duyệt? Sau khi gửi bạn không sửa được bản nháp này.</>
          : action.kind === 'revoke' ? <>Thu hồi <strong>v{action.v.versionNo}</strong>? Người dùng sẽ không tải được mẫu biểu này cho đến khi có phiên bản mới được phê duyệt.</>
          : <>Từ chối <strong>v{action.v.versionNo}</strong>? Phiên bản sẽ quay về bản nháp.</>}
        onConfirm={async reason => {
          const base = `/api/versions/${action.v.id}/${action.kind}`;
          if (action.kind === 'reject' || action.kind === 'revoke') await api.post(base, { reason }); else await api.post(base);
          toast('success', 'Đã thực hiện thao tác'); reloadAll();
        }}
        onClose={() => setAction(null)} />}
      <p><Link to="/forms">‹ Quay lại danh sách</Link></p>
    </>
  );
}

function EditInfo({ form, onClose, onSaved }: { form: FormDto; onClose: () => void; onSaved: () => void }) {
  const types = useAsync(() => api.get<FormType[]>('/api/form-types'), []);
  const [code, setCode] = useState(form.code);
  const [name, setName] = useState(form.name);
  const [description, setDescription] = useState(form.description ?? '');
  const [typeId, setTypeId] = useState(form.formTypeId ? String(form.formTypeId) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const hasApproved = form.current !== null || (form.latest !== null && form.latest.versionNo > 1);
  const codeBad = code && !/^[A-Za-z0-9._-]{1,50}$/.test(code) ? 'Mã gồm 1-50 ký tự chữ, số, dấu . _ -' : null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || codeBad || !name.trim()) return;
    setBusy(true); setError(null);
    try { await api.put(`/api/forms/${form.id}`, { code: code.trim(), name: name.trim(), description: description.trim() || null, formTypeId: typeId ? Number(typeId) : null }); onSaved(); }
    catch (err) { setError(err); setBusy(false); }
  };
  return (
    <Modal title="Chỉnh sửa thông tin mẫu biểu" onClose={() => { if (!busy) onClose(); }}>
      <form className="stack" onSubmit={submit} noValidate>
        <ErrorBox error={error} />
        <Field label="Mã mẫu biểu" htmlFor="e-code" required error={codeBad} hint={hasApproved ? 'Có thể bị từ chối nếu mẫu biểu đã có phiên bản được phê duyệt' : undefined}>
          <input id="e-code" value={code} onChange={e => setCode(e.target.value)} maxLength={50} /></Field>
        <Field label="Tên mẫu biểu" htmlFor="e-name" required><input id="e-name" value={name} onChange={e => setName(e.target.value)} maxLength={300} /></Field>
        <Field label="Loại mẫu biểu" htmlFor="e-type"><select id="e-type" value={typeId} onChange={e => setTypeId(e.target.value)}>
          <option value="">— Chưa chọn —</option>{(types.data ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        <Field label="Mô tả" htmlFor="e-desc"><textarea id="e-desc" rows={3} value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} /></Field>
        <div className="actions"><Button onClick={onClose} disabled={busy}>Hủy</Button><Button type="submit" variant="primary" loading={busy} disabled={!!codeBad || !name.trim()}>Lưu</Button></div>
      </form>
    </Modal>
  );
}

function NewVersion({ formId, onClose, onSaved }: { formId: string; onClose: () => void; onSaved: () => void }) {
  const [eff, setEff] = useState('');
  const [exp, setExp] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const fileBad = file ? checkFile(file) : null;
  const dateBad = eff && exp && exp < eff ? 'Ngày hết hiệu lực phải sau ngày hiệu lực' : null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !file || fileBad || dateBad) return;
    setBusy(true); setError(null);
    const fd = new FormData();
    if (eff) fd.append('EffectiveDate', eff); if (exp) fd.append('ExpiryDate', exp); if (note.trim()) fd.append('ChangeNote', note.trim());
    fd.append('File', file);
    try { await api.form('POST', `/api/forms/${formId}/versions`, fd); onSaved(); } catch (err) { setError(err); setBusy(false); }
  };
  return (
    <Modal title="Tạo phiên bản mới" onClose={() => { if (!busy) onClose(); }}>
      <form className="stack" onSubmit={submit} noValidate>
        <ErrorBox error={error} />
        <div className="form-grid">
          <Field label="Ngày hiệu lực" htmlFor="v-eff"><input id="v-eff" type="date" value={eff} onChange={e => setEff(e.target.value)} /></Field>
          <Field label="Ngày hết hiệu lực" htmlFor="v-exp" error={dateBad}><input id="v-exp" type="date" value={exp} min={eff || undefined} onChange={e => setExp(e.target.value)} /></Field>
        </div>
        <Field label="Ghi chú thay đổi" htmlFor="v-note"><textarea id="v-note" rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={2000} /></Field>
        <Field label="Tệp mẫu biểu" htmlFor="v-file" required error={fileBad} hint="docx, xlsx, pdf, doc, xls; tối đa 30 MB">
          <input id="v-file" type="file" accept=".docx,.xlsx,.pdf,.doc,.xls" onChange={e => setFile(e.target.files?.[0] ?? null)} /></Field>
        <div className="actions"><Button onClick={onClose} disabled={busy}>Hủy</Button><Button type="submit" variant="primary" loading={busy} disabled={!file || !!fileBad || !!dateBad}>Tải lên (lưu bản nháp)</Button></div>
        {busy && <small className="muted" role="status">Đang tải lên và kiểm tra tệp…</small>}
      </form>
    </Modal>
  );
}

function EditDraft({ v, onClose, onSaved }: { v: VersionDto; onClose: () => void; onSaved: () => void }) {
  const [eff, setEff] = useState(v.effectiveDate ?? '');
  const [exp, setExp] = useState(v.expiryDate ?? '');
  const [note, setNote] = useState(v.changeNote ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const fileBad = file ? checkFile(file) : null;
  const dateBad = eff && exp && exp < eff ? 'Ngày hết hiệu lực phải sau ngày hiệu lực' : null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || fileBad || dateBad) return;
    setBusy(true); setError(null);
    try {
      await api.put(`/api/versions/${v.id}`, { effectiveDate: eff || null, expiryDate: exp || null, changeNote: note.trim() || null });
      if (file) { const fd = new FormData(); fd.append('File', file); await api.form('PUT', `/api/versions/${v.id}/file`, fd); }
      onSaved();
    } catch (err) { setError(err); setBusy(false); }
  };
  return (
    <Modal title={`Sửa bản nháp v${v.versionNo}`} onClose={() => { if (!busy) onClose(); }}>
      <form className="stack" onSubmit={submit} noValidate>
        <ErrorBox error={error} />
        <div className="form-grid">
          <Field label="Ngày hiệu lực" htmlFor="d-eff"><input id="d-eff" type="date" value={eff} onChange={e => setEff(e.target.value)} /></Field>
          <Field label="Ngày hết hiệu lực" htmlFor="d-exp" error={dateBad}><input id="d-exp" type="date" value={exp} min={eff || undefined} onChange={e => setExp(e.target.value)} /></Field>
        </div>
        <Field label="Ghi chú thay đổi" htmlFor="d-note"><textarea id="d-note" rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={2000} /></Field>
        <Field label="Thay tệp (để trống nếu giữ nguyên)" htmlFor="d-file" error={fileBad} hint={`Tệp hiện tại: ${v.originalFileName}`}>
          <input id="d-file" type="file" accept=".docx,.xlsx,.pdf,.doc,.xls" onChange={e => setFile(e.target.files?.[0] ?? null)} /></Field>
        <div className="actions"><Button onClick={onClose} disabled={busy}>Hủy</Button><Button type="submit" variant="primary" loading={busy} disabled={!!fileBad || !!dateBad}>Lưu</Button></div>
      </form>
    </Modal>
  );
}

function HistoryDialog({ v, onClose }: { v: VersionDto; onClose: () => void }) {
  const { data, loading, error, reload } = useAsync(() => api.get<HistoryDto[]>(`/api/versions/${v.id}/history`), [v.id]);
  return (
    <Modal title={`Lịch sử phê duyệt v${v.versionNo}`} onClose={onClose}>
      {loading && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.length === 0 && <EmptyState text="Chưa có lịch sử" />}
      {data && data.length > 0 && <ul className="simple-list">{data.map(h => (
        <li key={h.id}><span><strong>{ACTION_LABELS[h.action] ?? h.action}</strong> · {h.actorName ?? 'Hệ thống'}{h.reason ? <><br /><span className="muted">Lý do: {h.reason}</span></> : null}</span>
          <span className="muted">{fmtDateTime(h.actedAt)}</span></li>))}</ul>}
    </Modal>
  );
}
