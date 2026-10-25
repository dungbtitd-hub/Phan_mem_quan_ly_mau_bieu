# ADR-003: Cookie session thay cho JWT

- **Bối cảnh:** giao diện và API cùng origin sau Nginx; cần khóa tài khoản và đổi vai trò có hiệu lực ngay.
- **Quyết định:** cookie `HttpOnly`, `Secure`, `SameSite=Strict`, hết hạn trượt 30 phút, tuyệt đối 8 giờ; mỗi request kiểm tra lại trạng thái tài khoản và vai trò trong database. Chống CSRF bằng antiforgery token (header `X-CSRF-TOKEN`).
- **Phương án đã loại:** JWT (khó thu hồi tức thì, phải lưu token phía trình duyệt).
- **Hệ quả:** thêm một truy vấn nhẹ mỗi request (chấp nhận được với 150 người dùng); frontend phải gọi `GET /api/auth/csrf` trước khi gửi request ghi và gọi lại sau khi đăng nhập hoặc đổi mật khẩu.
