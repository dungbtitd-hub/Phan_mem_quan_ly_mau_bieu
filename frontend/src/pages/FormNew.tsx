import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { ApplicationDto, FormDto, FormType, Paged, VersionDto } from '../api/types';
import { Button, ErrorBox, Field, PageHeader, useToast } from '../components/ui';
import { MAX_UPLOAD, checkFile, fmtBytes, useAsync } from '../util';

export default function FormNew() {
  const nav = useNavigate();
  const toast = useToast();
  const apps = useAsync(() => api.get<Paged<ApplicationDto>>('/api/applications?status=active&pageSize=100'), []);
  const types = useAsync(() => api.get<FormType[]>('/api/form-types'), []);
  const [applicationId, setApplicationId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<'draft' | 'submit' | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [dup, setDup] = useState<FormDto | null>(null);

  const codeBad = code && !/^[A-Za-z0-9._-]{1,50}$/.test(code) ? 'Mã gồm 1-50 ký tự chữ, số, dấu . _ -' : null;
  const dateBad = effectiveDate && expiryDate && expiryDate < effectiveDate ? 'Ngày hết hiệu lực phải sau ngày hiệu lực' : null;
  const fileBad = file ? checkFile(file) : null;
  const ready = !!applicationId && !!code && !!name.trim() && !!file && !codeBad && !dateBad && !fileBad;

  // Cảnh báo trùng mã ngay khi nhập, gợi ý tạo phiên bản mới thay vì tạo mẫu biểu mới
  useEffect(() => {
    setDup(null);
    if (!code || codeBad) return;
    let alive = true;
    const t = setTimeout(() => {
      api.get<Paged<FormDto>>(`/api/forms?q=${encodeURIComponent(code)}&pageSize=10`)
        .then(r => { if (alive) setDup(r.items.find(f => f.code.toLowerCase() === code.toLowerCase()) ?? null); })
        .catch(() => undefined);
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [code, codeBad]);

  const submit = async (e: FormEvent, thenSubmit: boolean) => {
    e.preventDefault();
    if (busy || !ready || dup) return;
    setBusy(thenSubmit ? 'submit' : 'draft'); setError(null);
    const fd = new FormData();
    fd.append('Code', code.trim()); fd.append('Name', name.trim()); fd.append('ApplicationId', applicationId);
    if (description.trim()) fd.append('Description', description.trim());
    if (typeId) fd.append('FormTypeId', typeId);
    if (effectiveDate) fd.append('EffectiveDate', effectiveDate);
    if (expiryDate) fd.append('ExpiryDate', expiryDate);
    if (changeNote.trim()) fd.append('ChangeNote', changeNote.trim());
    fd.append('File', file as File);
    try {
      const created = await api.form<{ id: string }>('POST', '/api/forms', fd);
      if (thenSubmit) {
        const versions = await api.get<VersionDto[]>(`/api/forms/${created.id}/versions`);
        await api.post(`/api/versions/${versions[0].id}/submit`);
        toast('success', 'Đã tạo mẫu biểu và gửi phê duyệt');
      } else toast('success', 'Đã lưu bản nháp');
      nav(`/forms/${created.id}`);
    } catch (err) { setError(err); setBusy(null); }
  };

  return (
    <>
      <PageHeader title="Tải lên mẫu biểu mới" />
      <form className="card stack" onSubmit={e => submit(e, false)} noValidate>
        <ErrorBox error={error} />
        {dup && <div className="alert alert-warn" role="alert">▲ Mã <strong>{dup.code}</strong> đã tồn tại ({dup.name}). Hãy <Link to={`/forms/${dup.id}`}>mở mẫu biểu này để tạo phiên bản mới</Link> thay vì tạo trùng mã.</div>}
        <div className="form-grid">
          <Field label="Hệ thống ứng dụng" htmlFor="n-app" required>
            <select id="n-app" value={applicationId} onChange={e => setApplicationId(e.target.value)}>
              <option value="">— Chọn hệ thống —</option>{(apps.data?.items ?? []).map(a => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}</select></Field>
          <Field label="Loại mẫu biểu" htmlFor="n-type">
            <select id="n-type" value={typeId} onChange={e => setTypeId(e.target.value)}>
              <option value="">— Chưa chọn —</option>{(types.data ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          <Field label="Mã mẫu biểu" htmlFor="n-code" required error={codeBad} hint="Do quản trị viên tự đặt, duy nhất toàn hệ thống, không đổi được sau khi có phiên bản được phê duyệt">
            <input id="n-code" value={code} onChange={e => setCode(e.target.value)} maxLength={50} /></Field>
          <Field label="Tên mẫu biểu" htmlFor="n-name" required><input id="n-name" value={name} onChange={e => setName(e.target.value)} maxLength={300} /></Field>
          <div className="span-all"><Field label="Mô tả" htmlFor="n-desc"><textarea id="n-desc" rows={3} value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} /></Field></div>
          <Field label="Ngày hiệu lực" htmlFor="n-eff"><input id="n-eff" type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} /></Field>
          <Field label="Ngày hết hiệu lực" htmlFor="n-exp" error={dateBad}><input id="n-exp" type="date" value={expiryDate} min={effectiveDate || undefined} onChange={e => setExpiryDate(e.target.value)} /></Field>
          <div className="span-all"><Field label="Ghi chú thay đổi" htmlFor="n-note"><textarea id="n-note" rows={2} value={changeNote} onChange={e => setChangeNote(e.target.value)} maxLength={2000} /></Field></div>
          <div className="span-all"><Field label="Tệp mẫu biểu" htmlFor="n-file" required error={fileBad} hint={`Chấp nhận docx, xlsx, pdf, doc, xls; tối đa ${fmtBytes(MAX_UPLOAD)}. Tệp có macro sẽ bị từ chối.`}>
            <input id="n-file" type="file" accept=".docx,.xlsx,.pdf,.doc,.xls" onChange={e => setFile(e.target.files?.[0] ?? null)} /></Field>
            {file && !fileBad && <small className="muted">{file.name} ({fmtBytes(file.size)})</small>}</div>
        </div>
        <div className="actions">
          <Button onClick={() => nav('/forms')} disabled={!!busy}>Hủy</Button>
          <Button type="submit" loading={busy === 'draft'} disabled={!ready || !!dup || busy === 'submit'}>Lưu bản nháp</Button>
          <Button variant="primary" loading={busy === 'submit'} disabled={!ready || !!dup || busy === 'draft'} onClick={e => submit(e, true)}>Lưu và gửi phê duyệt</Button>
        </div>
        {busy && <small className="muted" role="status">Đang tải lên và kiểm tra tệp, vui lòng không đóng trang…</small>}
      </form>
    </>
  );
}
