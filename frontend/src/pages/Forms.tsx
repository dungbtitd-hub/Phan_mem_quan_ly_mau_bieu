import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, downloadFile, qs } from '../api/client';
import type { ApplicationDto, FormDto, FormType, Paged } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button, EmptyState, ErrorState, Field, PageHeader, Pagination, Spinner, StatusBadge, useToast } from '../components/ui';
import { VERSION_STATUS, fmtDate, fmtDateTime, useAsync, useDebounced } from '../util';

export default function Forms() {
  const { hasRole } = useAuth();
  const admin = hasRole('admin');
  const privileged = admin || hasRole('approver');
  const nav = useNavigate();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const dq = useDebounced(q);
  const applicationId = sp.get('applicationId') ?? '';
  const typeId = sp.get('typeId') ?? '';
  const status = sp.get('status') ?? '';
  const sort = sp.get('sort') ?? 'updatedAt';
  const desc = sp.get('desc') !== 'false';
  const page = Number(sp.get('page') ?? 1);
  const [busyId, setBusyId] = useState<string | null>(null);

  const apps = useAsync(() => api.get<Paged<ApplicationDto>>('/api/applications?pageSize=100'), []);
  const types = useAsync(() => api.get<FormType[]>('/api/form-types'), []);
  const { data, loading, error, reload } = useAsync(
    () => api.get<Paged<FormDto>>(`/api/forms${qs({ q: dq, applicationId, typeId, status, sort, desc, page, pageSize: 20 })}`),
    [dq, applicationId, typeId, status, sort, desc, page]);

  const setParam = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); setSp(n); };
  const download = async (f: FormDto) => {
    setBusyId(f.id);
    try { await downloadFile(`/api/forms/${f.id}/download`); } catch (e) { toast('error', e instanceof Error ? e.message : 'Không tải được tệp'); } finally { setBusyId(null); }
  };

  return (
    <>
      <PageHeader title={admin ? 'Quản lý mẫu biểu' : 'Kho mẫu biểu'}>
        {admin && <Button variant="primary" onClick={() => nav('/forms/new')}>+ Tải lên mẫu biểu</Button>}
      </PageHeader>
      <div className="toolbar">
        <Field label="Từ khóa" htmlFor="fq"><input id="fq" value={q} onChange={e => { setQ(e.target.value); setParam('page', ''); }} placeholder="Mã hoặc tên (không cần gõ dấu)" maxLength={100} /></Field>
        <Field label="Hệ thống ứng dụng" htmlFor="fa">
          <select id="fa" value={applicationId} onChange={e => setParam('applicationId', e.target.value)}>
            <option value="">Tất cả</option>{(apps.data?.items ?? []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="Loại mẫu biểu" htmlFor="ft">
          <select id="ft" value={typeId} onChange={e => setParam('typeId', e.target.value)}>
            <option value="">Tất cả</option>{(types.data ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        {privileged && <Field label="Trạng thái" htmlFor="fs">
          <select id="fs" value={status} onChange={e => setParam('status', e.target.value)}>
            <option value="">Tất cả</option>{Object.entries(VERSION_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>}
        <Field label="Sắp xếp" htmlFor="fo">
          <select id="fo" value={`${sort}:${desc}`} onChange={e => { const [s, d] = e.target.value.split(':'); const n = new URLSearchParams(sp); n.set('sort', s); n.set('desc', d); n.delete('page'); setSp(n); }}>
            <option value="updatedAt:true">Mới cập nhật trước</option><option value="updatedAt:false">Cũ nhất trước</option>
            <option value="name:false">Tên A-Z</option><option value="name:true">Tên Z-A</option>
            <option value="code:false">Mã tăng dần</option><option value="application:false">Theo hệ thống</option></select></Field>
      </div>
      {loading && !data && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.items.length === 0 && <EmptyState text="Không tìm thấy mẫu biểu" hint="Thử đổi từ khóa hoặc bỏ bớt bộ lọc." />}
      {data && data.items.length > 0 && (
        <div className="table-wrap"><table>
          <thead><tr><th>Mã</th><th>Tên mẫu biểu</th><th>Hệ thống</th><th>Loại</th><th>Phiên bản hiện hành</th><th>Hiệu lực / hết hạn</th>{privileged && <th>Trạng thái</th>}<th>Cập nhật</th><th>Thao tác</th></tr></thead>
          <tbody>{data.items.map(f => (
            <tr key={f.id}>
              <td className="mono">{f.code}{f.isDemo && <> <span className="badge badge-demo">Minh họa</span></>}</td>
              <td><Link to={`/forms/${f.id}`}>{f.name}</Link></td><td>{f.applicationName}</td><td>{f.formTypeName ?? '—'}</td>
              <td>{f.current ? `v${f.current.versionNo}` : <span className="muted">Chưa có</span>}</td>
              <td className="nowrap">{f.current ? <>{fmtDate(f.current.effectiveDate)}<br /><span className="muted">{f.current.expiryDate ? `đến ${fmtDate(f.current.expiryDate)}` : 'không thời hạn'}</span></> : '—'}</td>
              {privileged && <td>{f.latest ? <><StatusBadge status={f.latest.status} /><br /><span className="muted">v{f.latest.versionNo}</span></> : '—'}</td>}
              <td className="nowrap">{fmtDateTime(f.updatedAt)}</td>
              <td><div className="row-actions">
                <Link className="btn btn-sm" to={`/forms/${f.id}`}>Chi tiết</Link>
                <Button small variant="primary" disabled={!f.current || f.current.status !== 'active'} loading={busyId === f.id} onClick={() => download(f)}>Tải xuống</Button>
              </div></td>
            </tr>))}</tbody></table></div>
      )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={p => setParam('page', String(p))} />}
    </>
  );
}
