# API (Bước 4)

Mọi response: `{ "success": bool, "data": ..., "message": "...", "error": { "code", "message", "details", "requestId" } | null }`.
Request ghi (POST/PUT/DELETE) cần header `X-CSRF-TOKEN` lấy từ `GET /api/auth/csrf` (gọi lại sau khi đăng nhập/đổi mật khẩu). Phân trang: `page`, `pageSize` (tối đa 100).
Quyền: A = Admin, P = Người phê duyệt, U = người dùng đăng nhập, AP = Admin hoặc Người phê duyệt.

| Method | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| GET | /api/auth/csrf | công khai | Lấy CSRF token |
| POST | /api/auth/login | công khai (rate limit 10/phút/IP) | Đăng nhập (sai 5 lần khóa 15 phút) |
| POST | /api/auth/logout | U | Đăng xuất |
| GET | /api/auth/me | U | Thông tin phiên |
| POST | /api/auth/change-password | U | Đổi mật khẩu (bắt buộc ở lần đầu) |
| GET/POST | /api/users | A | Danh sách / tạo tài khoản (trả mật khẩu tạm một lần) |
| GET/PUT | /api/users/{id} | A | Chi tiết / sửa thông tin |
| POST | /api/users/{id}/lock, /unlock, /reset-password | A | Khóa, mở khóa, đặt lại mật khẩu |
| PUT | /api/users/{id}/roles | A | Gán vai trò (admin, approver, user) |
| GET/POST/PUT | /api/groups, /api/groups/{id} | A | Nhóm người dùng |
| GET/PUT | /api/groups/{id}/members | A | Thành viên nhóm |
| GET | /api/applications, /api/applications/{id} | U | Hệ thống được phép xem (A/P xem tất cả) |
| POST/PUT | /api/applications, /api/applications/{id} | A | Tạo / sửa |
| POST | /api/applications/{id}/lock, /unlock | A | Khóa / mở khóa |
| GET/PUT | /api/applications/{id}/permissions | A | Quyền xem theo user/nhóm |
| GET | /api/form-types | U | Loại biểu mẫu |
| GET | /api/forms, /api/forms/{id} | U | Tìm, lọc, sắp xếp mẫu biểu theo quyền |
| POST | /api/forms | A | Tạo mẫu biểu + phiên bản 1 (multipart, tệp tối đa 30 MB) |
| PUT | /api/forms/{id} | A | Sửa (đổi mã bị chặn sau khi có bản được phê duyệt) |
| GET | /api/forms/{id}/download | U | Tải phiên bản đang hiệu lực |
| GET/POST | /api/forms/{formId}/versions | AP / A | Danh sách / tạo phiên bản mới (bản nháp) |
| GET | /api/versions, /api/versions/{id}, /api/versions/{id}/history | AP | Truy vấn phiên bản, lịch sử phê duyệt |
| PUT | /api/versions/{id}, /api/versions/{id}/file | A | Sửa bản nháp / thay tệp bản nháp |
| POST | /api/versions/{id}/submit | A | Gửi phê duyệt |
| POST | /api/versions/{id}/approve, /reject | P | Phê duyệt (không tự duyệt bản của mình) / từ chối (cần lý do) |
| POST | /api/versions/{id}/revoke | AP | Thu hồi bản đang hiệu lực (cần lý do) |
| GET | /api/versions/{id}/download | U (theo quyền) | Tải tệp, ghi log tải |
| GET | /api/dashboard/admin | A | Số liệu tổng quan |
| GET | /api/dashboard/home | U | Trang chủ người dùng |
| GET | /api/audit-logs | A | Nhật ký hoạt động (lọc thời gian, người dùng, hành động, kết quả) |
| GET | /api/reports/downloads | A | Thống kê lượt tải theo mẫu biểu |
| GET | /health/live, /health/ready | công khai | Kiểm tra sống / sẵn sàng (có database) |

Mã lỗi thường gặp: `VALIDATION_ERROR` 400, `AUTH_FAILED` 401, `PASSWORD_CHANGE_REQUIRED` 403, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT`/`FORM_CODE_EXISTS`/`INVALID_STATE` 409, `FILE_TOO_LARGE` 413, `FILE_TYPE_NOT_ALLOWED` 415, `FILE_CONTENT_INVALID`/`FILE_INFECTED` 422, `SCAN_UNAVAILABLE` 503.
`openapi.yaml` chưa xuất: ở môi trường Development API cung cấp `/openapi/v1.json`; sẽ xuất file ở Bước 6.
