import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/ui';
import { ROLE_LABELS } from '../util';

export function Account() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader title="Thông tin tài khoản" />
      <div className="card">
        <dl className="kv">
          <dt>Họ và tên</dt><dd>{user?.fullName}</dd>
          <dt>Tên đăng nhập</dt><dd>{user?.username}</dd>
          <dt>Vai trò</dt><dd>{user?.roles.map(r => ROLE_LABELS[r] ?? r).join(', ')}</dd>
        </dl>
        <p><Link className="btn" to="/change-password">Đổi mật khẩu</Link></p>
      </div>
    </>
  );
}

export function Help() {
  return (
    <>
      <PageHeader title="Hướng dẫn sử dụng" />
      <div className="card stack">
        <section><h3>Tìm và tải mẫu biểu</h3>
          <ol><li>Vào “Kho mẫu biểu” hoặc dùng ô tìm kiếm ở đầu trang; có thể tìm theo mã hoặc tên (không cần gõ dấu).</li>
            <li>Lọc theo hệ thống ứng dụng hoặc loại biểu mẫu.</li><li>Nhấn “Tải xuống” để tải phiên bản đang hiệu lực.</li></ol></section>
        <section><h3>Lưu ý</h3>
          <ul><li>Bạn chỉ thấy các hệ thống được cấp quyền. Cần thêm quyền, hãy liên hệ quản trị viên.</li>
            <li>Chỉ phiên bản “Đang hiệu lực” mới tải được. Mẫu biểu hết hiệu lực hoặc bị thu hồi sẽ không hiển thị.</li>
            <li>Mật khẩu cần ít nhất 10 ký tự. Không chia sẻ mật khẩu cho người khác.</li></ul></section>
      </div>
    </>
  );
}

export function NotFound() {
  return <div className="state"><strong>Không tìm thấy trang</strong><Link to="/">Về trang chủ</Link></div>;
}
