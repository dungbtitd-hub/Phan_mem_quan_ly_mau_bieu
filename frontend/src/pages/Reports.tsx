import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api/client';
import type { ApplicationDto, DownloadReportRow, Paged } from '../api/types';
import { EmptyState, ErrorState, Field, PageHeader, Spinner } from '../components/ui';
import { todayIso, useAsync } from '../util';

export default function Reports() {
  const [fromDate, setFrom] = useState(todayIso(-29));
  const [toDate, setTo] = useState(todayIso());
  const [applicationId, setApp] = useState('');
  const apps = useAsync(() => api.get<Paged<ApplicationDto>>('/api/applications?pageSize=100'), []);
  const { data, loading, error, reload } = useAsync(
    () => api.get<DownloadReportRow[]>(`/api/reports/downloads${qs({ fromDate, toDate, applicationId })}`), [fromDate, toDate, applicationId]);
  const total = (data ?? []).reduce((s, r) => s + r.downloads, 0);

  return (
    <>
      <PageHeader title="Báo cáo lượt tải xuống" />
      <div className="toolbar">
        <Field label="Từ ngày" htmlFor="r-f"><input id="r-f" type="date" value={fromDate} max={toDate} onChange={e => e.target.value && setFrom(e.target.value)} /></Field>
        <Field label="Đến ngày" htmlFor="r-t"><input id="r-t" type="date" value={toDate} min={fromDate} onChange={e => e.target.value && setTo(e.target.value)} /></Field>
        <Field label="Hệ thống ứng dụng" htmlFor="r-a"><select id="r-a" value={applicationId} onChange={e => setApp(e.target.value)}>
          <option value="">Tất cả</option>{(apps.data?.items ?? []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      </div>
      {loading && !data && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.length === 0 && <EmptyState text="Không có lượt tải trong khoảng đã chọn" />}
      {data && data.length > 0 && (
        <>
          <p className="muted">Tổng {total} lượt tải của {data.length} mẫu biểu (hiển thị tối đa 200 mẫu biểu nhiều lượt tải nhất).</p>
          <div className="table-wrap"><table>
            <thead><tr><th>Mã</th><th>Tên mẫu biểu</th><th>Lượt tải</th><th>Số người tải</th></tr></thead>
            <tbody>{data.map(r => (<tr key={r.formId}><td className="mono"><Link to={`/forms/${r.formId}`}>{r.code}</Link></td><td>{r.name}</td><td>{r.downloads}</td><td>{r.users}</td></tr>))}</tbody></table></div>
        </>
      )}
    </>
  );
}
