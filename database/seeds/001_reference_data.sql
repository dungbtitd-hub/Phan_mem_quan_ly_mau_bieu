-- Dữ liệu tham chiếu bắt buộc (idempotent). Không chứa tài khoản hay mật khẩu.
-- Tài khoản Admin khởi tạo do backend tạo khi khởi động từ biến môi trường ADMIN_INITIAL_*.
BEGIN;
INSERT INTO roles (id, code, name) VALUES
    (1, 'admin',    'Quản trị viên'),
    (2, 'approver', 'Người phê duyệt'),
    (3, 'user',     'Người dùng')
ON CONFLICT (id) DO NOTHING;

INSERT INTO form_types (code, name) VALUES
    ('BM',   'Biểu mẫu'),
    ('HD',   'Hướng dẫn'),
    ('KHAC', 'Khác')
ON CONFLICT (code) DO NOTHING;
COMMIT;
