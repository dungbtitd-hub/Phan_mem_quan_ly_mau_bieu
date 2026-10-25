# PROGRESS

## Đã hoàn thành
- [x] Bước 1: phân tích, giả định
- [x] Bước 2: kiến trúc (đã xác nhận)
- [x] Bước 3: schema, migration, seed, script migrate/backup/restore, docker-compose (chỉ db)

## Còn lại
- [x] Bước 4: backend ASP.NET Core + API (đã VIẾT, CHƯA BIÊN DỊCH/CHẠY, xem trạng thái kiểm chứng)
- [x] Bước 5: frontend React + TypeScript + Vite (đã VIẾT, CHƯA CÀI/BUILD/CHẠY, xem trạng thái kiểm chứng)
- [ ] Bước 6: bảo mật + kiểm thử
- [x] Bước 7: Docker đầy đủ (api, web, migrate, nginx HTTPS), bộ cài offline/online, workflow release, hướng dẫn cài đặt (docs/HUONG-DAN-CAI-DAT.md)
- [ ] Bước 8: kiểm chứng, nghiệm thu, bàn giao

## Giả định đang áp dụng
Mức Nội bộ; ASP.NET Core + React + PostgreSQL; tài khoản cục bộ Argon2id; phê duyệt một cấp, người tải lên không tự phê duyệt; tệp docx/xlsx/pdf/doc/xls tối đa 30 MB; ClamAV tùy chọn; mã mẫu biểu do Admin đặt (chữ, số, . _ -, tối đa 50 ký tự, duy nhất không phân biệt hoa thường).

## Trạng thái kiểm chứng (cập nhật 2026-10-25)
- ĐÃ CHẠY: migration 001, 002 + seed trên PostgreSQL 16 (chạy lại lần 2 báo "Bỏ qua"); `dotnet build` (.NET 10) không lỗi; `npm ci`, `tsc`, `vite build` không lỗi.
- ĐÃ CHẠY: luồng đầy đủ qua API và giao diện: đăng nhập Admin → đổi mật khẩu → tạo người dùng/hệ thống/phân quyền → tải lên → gửi duyệt → phê duyệt/từ chối → người dùng chỉ thấy và tải mẫu biểu được phép.
- ĐÃ CHẠY: cài bằng `deploy/install.sh` (Docker Compose, Nginx HTTPS) + `deploy/ci/smoke-test.sh`.
- Đã sửa: `AutoValidateAntiforgeryTokenAttribute` làm mọi POST/PUT lỗi 500 (thiếu dịch vụ MVC Views) → thay bằng `ValidateAntiforgeryFilter`, lỗi CSRF trả về theo định dạng ApiResponse (`CSRF_INVALID`). Thiếu `@types/node` cho vite.config.ts. Khóa Data Protection lưu bền (`DataProtection:KeysPath`) để phiên không mất khi khởi động lại container.
- `npm audit`: còn cảnh báo mức trung bình ở react-router 6 và mức cao ở vite 5 (chỉ ảnh hưởng máy chủ phát triển, không có trong bản chạy thật). Nên nâng cấp ở Bước 6.

## Trạng thái kiểm chứng (bản bàn giao ban đầu)
- SQL migration 001, 002: CHƯA CHẠY (môi trường tạo mã không có PostgreSQL). Cách kiểm tra: xem README.
- Backend C#: CHƯA BIÊN DỊCH, CHƯA CHẠY (môi trường tạo mã không có .NET SDK). Mới kiểm tra được độ cân bằng ngoặc của 23 file .cs. Phiên bản gói NuGet (`10.0.*`, `1.3.*`) chưa xác minh, lockfile sẽ sinh ở lần `dotnet restore` đầu tiên.
- Frontend (22 file .ts/.tsx, ~2.000 dòng): CHƯA `npm install`, CHƯA `tsc`, CHƯA chạy trình duyệt (môi trường tạo mã không có mạng). Mới kiểm tra độ cân bằng ngoặc. Phiên bản gói dùng khoảng caret (react 18.3, react-router 6.28, vite 5.4, typescript 5.6), chưa xác minh; `package-lock.json` sẽ sinh ở lần `npm install` đầu tiên.
- Chưa có test tự động (Bước 6), chưa có Dockerfile cho api (Bước 7), chưa xuất openapi.yaml.

## Giới hạn đã biết của Bước 4
- Phê duyệt kích hoạt phiên bản ngay; `effective_date` chỉ mang tính hiển thị (không có kích hoạt theo lịch).
- Ghi audit là best-effort (lỗi ghi log chỉ được ghi vào log ứng dụng, không làm hỏng thao tác).
- Chưa xuất CSV báo cáo/nhật ký; chưa kiểm tra lại SHA-256 khi tải; chưa tích hợp LDAP/AD.
- Lỗi antiforgery trả 400 mặc định của framework (chưa bọc theo định dạng ApiResponse).

## Giới hạn đã biết của Bước 5
- Đối chiếu với đặc tả giao diện: chưa có chuông thông báo trên Header; mục "Quản lý phiên bản" được gộp vào trang chi tiết mẫu biểu và trang Phê duyệt (không có mục menu riêng); "Mẫu biểu mới cập nhật" và "Đã tải gần đây" là khu vực trên trang chủ, không có trang riêng.
- Tải lên chưa có thanh tiến trình (chỉ hiển thị trạng thái đang tải); chưa xuất CSV báo cáo/nhật ký.
- Logo: dùng ô giữ chỗ "LOGO" cho đến khi đặt file chính thức vào `frontend/public/brand/logo.svg`.
- Chưa kiểm tra accessibility bằng công cụ (axe, Lighthouse) và chưa kiểm thử trên điện thoại/máy tính bảng thật; mới thiết kế responsive theo CSS.
- Tài khoản chỉ có vai trò Admin không thấy "Trang chủ người dùng" (Admin có Dashboard riêng); muốn thử luồng người dùng cần tạo thêm tài khoản vai trò "Người dùng".
- Nginx phục vụ build tĩnh và Dockerfile frontend sẽ làm ở Bước 7.
