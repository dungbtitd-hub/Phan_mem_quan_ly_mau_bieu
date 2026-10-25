import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { HomeData } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button, EmptyState, ErrorState, PageHeader, Spinner } from '../components/ui';
import { fmtDate, fmtDateTime, useAsync } from '../util';

export default function UserHome() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const { data, loading, error, reload } = useAsync(() => api.get<HomeData>('/api/dashboard/home'), []);
  const submit = (e: FormEvent) => { e.preventDefault(); nav(`/forms?q=${encodeURIComponent(q.trim())}`); };

  return (
    <>
      <PageHeader title={`Xin chào, ${user?.fullName ?? ''}`} />
      <form className="search-hero" role="search" onSubmit={submit}>
        <label htmlFor="hero-q" className="sr-only">Tìm mẫu biểu</label>
        <input id="hero-q" value={q} onChange={e => setQ(e.target.value)} placeholder="Nhập mã hoặc tên mẫu biểu cần tìm…" maxLength={100} />
        <Button type="submit" variant="primary">Tìm kiếm</Button>
      </form>
      {loading && !data && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <>
          <h2 style={{ marginBottom: 10 }}>Hệ thống ứng dụng của bạn</h2>
          {data.applications.length === 0
            ? <EmptyState text="Bạn chưa được cấp quyền truy cập hệ thống nào" hint="Vui lòng liên hệ quản trị viên để được cấp quyền." />
            : <div className="grid grid-cards" style={{ marginBottom: 20 }}>{data.applications.map(a => (
              <div key={a.id} className="card app-card">
                <strong>{a.name}</strong><span className="muted mono">{a.code}</span>
                <p>{a.description ?? 'Chưa có mô tả'}</p>
                <span>{a.formCount} mẫu biểu</span>
                <Link className="btn btn-primary" to={`/forms?applicationId=${a.id}`}>Xem mẫu biểu</Link>
              </div>))}</div>}
          <div className="grid grid-2">
            <section className="card"><h3>Mẫu biểu mới cập nhật</h3>
              {data.recentForms.length === 0 ? <EmptyState text="Chưa có mẫu biểu" /> :
                <ul className="simple-list">{data.recentForms.map(f => (
                  <li key={f.id}><span><Link to={`/forms/${f.id}`}>{f.code}</Link> · {f.name} <span className="muted">({f.applicationName}, v{f.versionNo})</span></span>
                    <span className="muted">{fmtDateTime(f.updatedAt)}</span></li>))}</ul>}</section>
            <section className="card"><h3>Mẫu biểu sắp hết hiệu lực</h3>
              {data.expiringForms.length === 0 ? <EmptyState text="Không có mẫu biểu sắp hết hiệu lực" /> :
                <ul className="simple-list">{data.expiringForms.map(f => (
                  <li key={f.id}><span><Link to={`/forms/${f.id}`}>{f.code}</Link> · {f.name}</span>
                    <span className="badge badge-warn">▲ Hết hạn {fmtDate(f.expiryDate)}</span></li>))}</ul>}</section>
          </div>
          <div className="grid grid-2">
            <section className="card"><h3>Đã tải gần đây</h3>
              {data.recentDownloads.length === 0 ? <EmptyState text="Bạn chưa tải mẫu biểu nào" /> :
                <ul className="simple-list">{data.recentDownloads.map((d, i) => (
                  <li key={i}><span><Link to={`/forms/${d.formId}`}>{d.formCode}</Link> · {d.formName} (v{d.versionNo})</span>
                    <span className="muted">{fmtDateTime(d.downloadedAt)}</span></li>))}</ul>}</section>
            <section className="card"><h3>Hướng dẫn nhanh</h3>
              <ol><li>Nhập mã hoặc tên mẫu biểu vào ô tìm kiếm.</li><li>Mở mẫu biểu để xem phiên bản đang hiệu lực.</li><li>Nhấn “Tải xuống” để tải tệp.</li></ol>
              <Link to="/help">Xem hướng dẫn đầy đủ</Link></section>
          </div>
        </>
      )}
    </>
  );
}
