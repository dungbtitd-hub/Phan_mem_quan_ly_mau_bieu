import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, downloadFile, qs } from '../api/client';
import type { Paged, VersionDto } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button, ConfirmDialog, EmptyState, ErrorState, PageHeader, Pagination, Spinner, useToast } from '../components/ui';
import { fmtBytes, fmtDate, fmtDateTime, useAsync } from '../util';

export default function Approvals() {
  const { hasRole } = useAuth();
  const approver = hasRole('approver');
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const page = Number(sp.get('page') ?? 1);
  const { data, loading, error, reload } = useAsync(() => api.get<Paged<VersionDto>>(`/api/versions${qs({ status: 'pending', page, pageSize: 20 })}`), [page]);
  const [action, setAction] = useState<{ v: VersionDto; kind: 'approve' | 'reject' } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const download = async (v: VersionDto) => {
    setBusy(v.id);
    try { await downloadFile(`/api/versions/${v.id}/download`); } catch (e) { toast('error', e instanceof Error ? e.message : 'Không tải được tệp'); } finally { setBusy(null); }
  };

  return (
    <>
      <PageHeader title="Phê duyệt mẫu biểu" />
      {!approver && <div className="alert alert-warn" role="status" style={{ marginBottom: 12 }}>▲ Bạn chỉ có quyền xem. Chỉ tài khoản có vai trò “Người phê duyệt” mới phê duyệt hoặc từ chối được.</div>}
      {loading && !data && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.items.length === 0 && <EmptyState text="Không có phiên bản nào chờ phê duyệt" />}
      {data && data.items.length > 0 && (
        <div className="table-wrap"><table>
          <thead><tr><th>Mẫu biểu</th><th>Phiên bản</th><th>Tệp</th><th>Hiệu lực</th><th>Người gửi</th><th>Ghi chú</th><th>Thao tác</th></tr></thead>
          <tbody>{data.items.map(v => (
            <tr key={v.id}>
              <td><Link to={`/forms/${v.formId}`}>{v.formCode}</Link><br /><span className="muted">{v.formName}</span></td>
              <td>v{v.versionNo}</td>
              <td>{v.originalFileName}<br /><span className="muted">{fmtBytes(v.sizeBytes)}</span></td>
              <td className="nowrap">{fmtDate(v.effectiveDate)}<br /><span className="muted">{v.expiryDate ? `đến ${fmtDate(v.expiryDate)}` : 'không thời hạn'}</span></td>
              <td>{v.createdByName}<br /><span className="muted">{fmtDateTime(v.submittedAt)}</span></td>
              <td>{v.changeNote ?? '—'}</td>
              <td><div className="row-actions">
                <Button small onClick={() => download(v)} loading={busy === v.id}>Tải để xem</Button>
                {approver && <><Button small variant="primary" onClick={() => setAction({ v, kind: 'approve' })}>Phê duyệt</Button>
                  <Button small variant="danger" onClick={() => setAction({ v, kind: 'reject' })}>Từ chối</Button></>}
              </div></td>
            </tr>))}</tbody></table></div>
      )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={p => { const n = new URLSearchParams(sp); n.set('page', String(p)); setSp(n); }} />}
      {action && <ConfirmDialog
        title={action.kind === 'approve' ? 'Phê duyệt phiên bản' : 'Từ chối phiên bản'} danger={action.kind === 'reject'} withReason={action.kind === 'reject'}
        confirmLabel={action.kind === 'approve' ? 'Phê duyệt' : 'Từ chối'}
        message={action.kind === 'approve'
          ? <>Phê duyệt <strong>{action.v.formCode} v{action.v.versionNo}</strong>? Phiên bản có hiệu lực ngay và thay thế phiên bản hiện hành (nếu có). Bạn không thể duyệt bản do chính mình tải lên.</>
          : <>Từ chối <strong>{action.v.formCode} v{action.v.versionNo}</strong>? Phiên bản quay về bản nháp.</>}
        onConfirm={async reason => {
          const base = `/api/versions/${action.v.id}/${action.kind}`;
          if (action.kind === 'reject') await api.post(base, { reason }); else await api.post(base);
          toast('success', action.kind === 'approve' ? 'Đã phê duyệt' : 'Đã từ chối'); reload();
        }}
        onClose={() => setAction(null)} />}
    </>
  );
}
