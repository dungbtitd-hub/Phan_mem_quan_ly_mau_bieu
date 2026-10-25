import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api/client';
import type { AdminDashboard as Data } from '../api/types';
import { BarList, EmptyState, ErrorState, Field, PageHeader, Spinner, StatCard } from '../components/ui';
import { fmtDate, fmtDateTime, todayIso, useAsync } from '../util';

const ACTION_LABELS: Record<string, string> = {
  'form.create': 'Tạo mẫu biểu', 'form.update': 'Sửa mẫu biểu', 'version.create': 'Tạo phiên bản', 'version.submit': 'Gửi phê duyệt',
  'version.approve': 'Phê duyệt', 'version.reject': 'Từ chối', 'version.revoke': 'Thu hồi', 'version.update': 'Sửa bản nháp',
  'version.replace_file': 'Thay tệp bản nháp', 'user.create': 'Tạo tài khoản', 'user.update': 'Sửa tài khoản', 'user.lock': 'Khóa tài khoản',
  'user.unlock': 'Mở khóa tài khoản', 'user.reset_password': 'Đặt lại mật khẩu', 'user.set_roles': 'Gán vai trò',
  'application.create': 'Tạo hệ thống', 'application.update': 'Sửa hệ thống', 'application.lock': 'Khóa hệ thống',
  'application.unlock': 'Mở khóa hệ thống', 'application.set_permissions': 'Phân quyền hệ thống', 'group.create': 'Tạo nhóm',
  'group.update': 'Sửa nhóm', 'group.set_members': 'Cập nhật thành viên nhóm', 'auth.change_password': 'Đổi mật khẩu'
};

export default function AdminDashboard() {
  const [from, setFrom] = useState(todayIso(-29));
  const [to, setTo] = useState(todayIso());
  const { data, loading, error, reload } = useAsync(
    () => api.get<Data>(`/api/dashboard/admin${qs({ fromDate: from, toDate: to })}`), [from, to]);

  return (
    <>
      <PageHeader title="Tổng quan hệ thống" />
      <div className="toolbar">
        <Field label="Lượt tải từ ngày" htmlFor="df"><input id="df" type="date" value={from} max={to} onChange={e => e.target.value && setFrom(e.target.value)} /></Field>
        <Field label="Đến ngày" htmlFor="dt"><input id="dt" type="date" value={to} min={from} max={todayIso()} onChange={e => e.target.value && setTo(e.target.value)} /></Field>
      </div>
      {loading && !data && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <>
          <div className="grid grid-stats">
            <StatCard label="Hệ thống ứng dụng" value={data.totals.applications} />
            <StatCard label="Mẫu biểu" value={data.totals.forms} />
            <StatCard label="Phiên bản đang hiệu lực" value={data.totals.activeVersions} />
            <StatCard label="Chờ phê duyệt" value={data.totals.pendingVersions} tone={data.totals.pendingVersions > 0 ? 'warn' : undefined} />
            <StatCard label="Sắp hết hiệu lực (30 ngày)" value={data.totals.expiringSoon} tone={data.totals.expiringSoon > 0 ? 'warn' : undefined} />
            <StatCard label="Tài khoản hoạt động" value={data.totals.activeUsers} />
            <StatCard label="Lượt tải trong kỳ" value={data.totals.downloads} />
          </div>
          <div className="grid grid-2">
            <section className="card"><h3>Số mẫu biểu theo hệ thống ứng dụng</h3>
              <BarList items={data.formsByApplication.map(a => ({ label: `${a.code} - ${a.name}`, value: a.count }))} /></section>
            <section className="card"><h3>Lượt tải theo ngày</h3>
              <BarList items={data.downloadsByDay.map(d => ({ label: fmtDate(d.day), value: d.count }))} empty="Chưa có lượt tải trong kỳ" /></section>
          </div>
          <div className="grid grid-2">
            <section className="card"><h3>Phiên bản mới cập nhật</h3>
              {data.recentVersions.length === 0 ? <EmptyState text="Chưa có phiên bản nào" /> :
                <ul className="simple-list">{data.recentVersions.map(v => (
                  <li key={v.id}><span><Link to={`/forms/${v.formId}`}>{v.formCode}</Link> v{v.versionNo} · {v.formName}</span>
                    <span className="muted">{v.by} · {fmtDateTime(v.createdAt)}</span></li>))}</ul>}</section>
            <section className="card"><h3>Mẫu biểu sắp hết hiệu lực</h3>
              {data.expiringVersions.length === 0 ? <EmptyState text="Không có mẫu biểu sắp hết hiệu lực" /> :
                <ul className="simple-list">{data.expiringVersions.map(v => (
                  <li key={v.id}><span><Link to={`/forms/${v.formId}`}>{v.formCode}</Link> v{v.versionNo} · {v.formName}</span>
                    <span className="badge badge-warn">▲ Hết hạn {fmtDate(v.expiryDate)}</span></li>))}</ul>}</section>
          </div>
          <div className="grid grid-2">
            <section className="card"><h3>Hoạt động quản trị gần đây</h3>
              {data.recentAdminActions.length === 0 ? <EmptyState text="Chưa có hoạt động" /> :
                <ul className="simple-list">{data.recentAdminActions.map((a, i) => (
                  <li key={i}><span>{ACTION_LABELS[a.action] ?? a.action}{a.usernameSnapshot ? ` · ${a.usernameSnapshot}` : ''}</span>
                    <span className="muted">{fmtDateTime(a.occurredAt)}</span></li>))}</ul>}
              <p><Link to="/audit">Xem toàn bộ nhật ký</Link></p></section>
            <section className="card"><h3>Cảnh báo cần xử lý</h3>
              {data.totals.pendingVersions === 0 && data.totals.expiringSoon === 0
                ? <EmptyState text="Không có cảnh báo" />
                : <ul className="simple-list">
                  {data.totals.pendingVersions > 0 && <li><span>▲ {data.totals.pendingVersions} phiên bản chờ phê duyệt</span><Link to="/approvals">Xem</Link></li>}
                  {data.totals.expiringSoon > 0 && <li><span>▲ {data.totals.expiringSoon} mẫu biểu sắp hết hiệu lực</span><Link to="/forms?status=active">Xem</Link></li>}
                </ul>}</section>
          </div>
        </>
      )}
    </>
  );
}
