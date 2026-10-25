import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABELS } from '../util';
import { BrandBlock } from './BrandLogo';
import { Icon } from './ui';

interface NavItem { to: string; label: string; icon: string; show: boolean; end?: boolean }

const CRUMBS: Record<string, string> = {
  applications: 'Hệ thống ứng dụng', forms: 'Mẫu biểu', approvals: 'Phê duyệt mẫu biểu', users: 'Người dùng', groups: 'Nhóm người dùng',
  audit: 'Nhật ký hoạt động', reports: 'Báo cáo và thống kê', help: 'Hướng dẫn sử dụng', account: 'Thông tin tài khoản', new: 'Tải lên mẫu biểu'
};

export default function Layout() {
  const { user, logout, hasRole } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [q, setQ] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const admin = hasRole('admin');
  const privileged = admin || hasRole('approver');

  useEffect(() => { setOpen(false); setMenu(false); }, [loc.pathname]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const items: NavItem[] = [
    { to: '/', label: admin ? 'Tổng quan' : 'Trang chủ', icon: 'home', show: true, end: true },
    { to: '/applications', label: admin ? 'Quản lý hệ thống ứng dụng' : 'Danh sách hệ thống ứng dụng', icon: 'grid', show: true },
    { to: '/forms', label: admin ? 'Quản lý mẫu biểu' : 'Kho mẫu biểu', icon: 'file', show: true },
    { to: '/approvals', label: 'Phê duyệt mẫu biểu', icon: 'check', show: privileged },
    { to: '/users', label: 'Quản lý người dùng', icon: 'users', show: admin },
    { to: '/groups', label: 'Nhóm người dùng', icon: 'shield', show: admin },
    { to: '/audit', label: 'Nhật ký hoạt động', icon: 'log', show: admin },
    { to: '/reports', label: 'Báo cáo và thống kê', icon: 'chart', show: admin },
    { to: '/help', label: 'Hướng dẫn sử dụng', icon: 'help', show: !admin },
    { to: '/account', label: 'Thông tin tài khoản', icon: 'user', show: true }
  ];

  const segs = loc.pathname.split('/').filter(Boolean);
  const crumbs = segs.map((s, i) => ({ label: CRUMBS[s] ?? 'Chi tiết', to: '/' + segs.slice(0, i + 1).join('/'), last: i === segs.length - 1 }));

  const search = (e: FormEvent) => { e.preventDefault(); nav(`/forms?q=${encodeURIComponent(q.trim())}`); };

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Bỏ qua điều hướng</a>
      <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Điều hướng chính">
        <div className="sidebar-brand"><BrandBlock fallback="Quản lý mẫu biểu" /></div>
        <nav>
          {items.filter(i => i.show).map(i => (
            <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <Icon name={i.icon} /> <span>{i.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} />}

      <div className="main-col">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(o => !o)} aria-label="Mở menu" aria-expanded={open}><Icon name="menu" size={22} /></button>
          <div className="topbar-title">CỔNG QUẢN LÝ MẪU BIỂU ỨNG DỤNG</div>
          <form className="quick-search" role="search" onSubmit={search}>
            <label htmlFor="quick-q" className="sr-only">Tìm nhanh mẫu biểu</label>
            <Icon name="search" />
            <input id="quick-q" value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm mẫu biểu theo mã hoặc tên…" maxLength={100} />
          </form>
          <div className="account" ref={menuRef}>
            <button className="account-btn" onClick={() => setMenu(m => !m)} aria-haspopup="menu" aria-expanded={menu}>
              <span className="account-name">{user?.fullName}</span>
              <span className="account-role">{user?.roles.map(r => ROLE_LABELS[r] ?? r).join(', ')}</span>
            </button>
            {menu && (
              <div className="menu" role="menu">
                <Link role="menuitem" to="/account">Thông tin tài khoản</Link>
                <Link role="menuitem" to="/change-password">Đổi mật khẩu</Link>
                <button role="menuitem" onClick={() => { void logout().then(() => nav('/login')); }}>Đăng xuất</button>
              </div>
            )}
          </div>
        </header>
        {crumbs.length > 0 && (
          <nav className="breadcrumb" aria-label="Vị trí hiện tại">
            <Link to="/">Trang chủ</Link>
            {crumbs.map(c => (c.last ? <span key={c.to} aria-current="page"> / {c.label}</span> : <span key={c.to}> / <Link to={c.to}>{c.label}</Link></span>))}
          </nav>
        )}
        <main id="main" className="content" tabIndex={-1}><Outlet /></main>
      </div>
    </div>
  );
}
