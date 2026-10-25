import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../api/client';
import type { AuditLogDto, Paged } from '../api/types';
import { EmptyState, ErrorState, Field, PageHeader, Pagination, Spinner, StatusBadge } from '../components/ui';
import { fmtDateTime, todayIso, useAsync, useDebounced } from '../util';

export default function AuditLogs() {
  const [sp, setSp] = useSearchParams();
  const page = Number(sp.get('page') ?? 1);
  const fromDate = sp.get('fromDate') ?? todayIso(-6);
  const toDate = sp.get('toDate') ?? todayIso();
  const result = sp.get('result') ?? '';
  const [action, setAction] = useState(sp.get('action') ?? '');
  const dAction = useDebounced(action);
  const { data, loading, error, reload } = useAsync(
    () => api.get<Paged<AuditLogDto>>(`/api/audit-logs${qs({ fromDate, toDate, result, action: dAction, page, pageSize: 50 })}`), [fromDate, toDate, result, dAction, page]);
  const setParam = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); setSp(n); };

  return (
    <>
      <PageHeader title="Nhật ký hoạt động" />
      <div className="toolbar">
        <Field label="Từ ngày" htmlFor="l-f"><input id="l-f" type="date" value={fromDate} max={toDate} onChange={e => e.target.value && setParam('fromDate', e.target.value)} /></Field>
        <Field label="Đến ngày" htmlFor="l-t"><input id="l-t" type="date" value={toDate} min={fromDate} onChange={e => e.target.value && setParam('toDate', e.target.value)} /></Field>
        <Field label="Hành động" htmlFor="l-a"><input id="l-a" value={action} onChange={e => { setAction(e.target.value); setParam('page', ''); }} placeholder="Ví dụ: auth.login, version" maxLength={60} /></Field>
        <Field label="Kết quả" htmlFor="l-r"><select id="l-r" value={result} onChange={e => setParam('result', e.target.value)}>
          <option value="">Tất cả</option><option value="success">Thành công</option><option value="failure">Thất bại</option></select></Field>
      </div>
      {loading && !data && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.items.length === 0 && <EmptyState text="Không có nhật ký trong khoảng đã chọn" />}
      {data && data.items.length > 0 && (
        <div className="table-wrap"><table>
          <thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Kết quả</th><th>IP / Mã yêu cầu</th><th>Chi tiết</th></tr></thead>
          <tbody>{data.items.map(a => (
            <tr key={a.id}>
              <td className="nowrap">{fmtDateTime(a.occurredAt)}</td><td>{a.username ?? '—'}</td><td className="mono">{a.action}</td>
              <td>{a.objectType ?? '—'}<br /><span className="mono muted">{a.objectId ?? ''}</span></td>
              <td><StatusBadge status={a.result} kind="result" /></td>
              <td className="mono">{a.ipAddress ?? '—'}<br /><span className="muted">{a.requestId ?? ''}</span></td>
              <td>{a.detail ? <details><summary>Xem</summary><pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{a.detail}</pre></details> : '—'}</td>
            </tr>))}</tbody></table></div>
      )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={p => setParam('page', String(p))} />}
    </>
  );
}
