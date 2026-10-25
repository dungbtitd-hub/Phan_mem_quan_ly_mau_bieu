# Cổng quản lý mẫu biểu ứng dụng

Trạng thái: database, backend, frontend đã biên dịch và chạy thử (Bước 0 xong). Đã có Dockerfile api/web/migrate, Nginx HTTPS và bộ cài cho máy chủ (Bước 7).

## Cài đặt trên máy chủ
Tải bộ cài ở trang **Releases** (hoặc Actions → release → Artifacts), giải nén và chạy `sudo ./install.sh`.
Hướng dẫn đầy đủ: [docs/HUONG-DAN-CAI-DAT.md](docs/HUONG-DAN-CAI-DAT.md).

## Tạo bộ cài (GitHub Actions)
- Workflow `.github/workflows/release.yml` build 3 image (`api`, `web`, `migrate`), **cài thử bằng `install.sh` và kiểm thử nhanh qua HTTPS** trên máy ảo GitHub, rồi đóng gói `formportal-<phiên bản>-offline.tar.gz` (kèm image) và `-online.tar.gz`.
- Phát hành bản mới: Actions → **release** → **Run workflow**, nhập phiên bản (vd 0.2.0), chọn "Phát hành GitHub Release"; hoặc `git tag v0.2.0 && git push origin v0.2.0` → tạo GitHub Release đính kèm bộ cài và đẩy image lên `ghcr.io/<owner>/<repo>/{api,web,migrate}`.
- Build thử không phát hành: Actions → **release** → **Run workflow**; bộ cài ở mục Artifacts.
- Cấu trúc: `deploy/` (compose, script cài/cập nhật/sao lưu, Dockerfile, cấu hình Nginx), `deploy/ci/` (kiểm thử nhanh).
- Build image từ mã nguồn trên máy có mạng: xem đầu tệp `deploy/docker-compose.build.yml`.

## Logo
Logo không đóng gói vào bản build: đặt `logo.svg` (hoặc `.png/.webp/.jpg`) và `favicon.png` vào thư mục `branding/` của bộ cài trên máy chủ, thay bất kỳ lúc nào. Khi phát triển: đặt vào `frontend/public/brand/`.

## Kiểm tra database
```bash
cp .env.example .env            # rồi đặt giá trị thật cho các biến
docker compose config
docker compose up -d db
docker compose ps               # chờ db ở trạng thái healthy
export DATABASE_URL="postgresql://formportal_app:<MAT_KHAU>@127.0.0.1:5432/formportal"
./scripts/migrate.sh --seed-demo   # bỏ --seed-demo trên môi trường thật
```
Chạy `migrate.sh` lần hai phải báo "Bỏ qua" cho mọi migration (idempotent).

## Sao lưu / phục hồi
Trên máy chủ: `./backup.sh`, `./restore.sh` trong thư mục bộ cài (nguồn: `deploy/`). Xem mục 11 của hướng dẫn cài đặt.

## Chạy backend (local, cần .NET SDK 10)
```bash
cd backend/src/Api
dotnet --version                      # xác nhận SDK; nếu dùng bản khác, sửa TargetFramework trong .csproj
dotnet restore                        # dùng packages.lock.json đã commit
export ConnectionStrings__Default="Host=127.0.0.1;Port=5432;Database=formportal;Username=formportal_app;Password=<MAT_KHAU>"
export Upload__StoragePath="$HOME/formportal-files"
export AdminSeed__Username=admin
export AdminSeed__Password="<MAT_KHAU_TAM_THOI_DAT_CHINH_SACH>"   # >=10 ký tự, >=3 loại ký tự
export ASPNETCORE_ENVIRONMENT=Development
dotnet run
curl -fsS http://localhost:5000/health/ready    # cổng thực tế xem dòng log "Now listening on"
```
Lần đăng nhập đầu của Admin bắt buộc đổi mật khẩu. Luồng gọi API tối thiểu: `GET /api/auth/csrf` → `POST /api/auth/login` (header `X-CSRF-TOKEN`, gửi kèm cookie) → `GET /api/auth/csrf` lần nữa → các request ghi. Danh sách endpoint: `docs/api.md`.
Khi chạy sau Nginx/TLS, đặt `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` và chỉ cho Nginx truy cập API.

## Chạy frontend (local, cần Node.js 20+)
```bash
cd frontend
node --version
npm ci                      # dùng package-lock.json đã commit
npm run typecheck           # kiểm tra kiểu TypeScript
npm run dev                 # http://localhost:5173, tự chuyển /api và /health tới http://localhost:5000
# Backend ở cổng khác: API_TARGET=http://localhost:PORT npm run dev
npm run build               # xuất bản build tĩnh vào frontend/dist
```
Chạy backend trước (xem phần trên) rồi mở http://localhost:5173. Đăng nhập bằng tài khoản Admin khởi tạo; hệ thống sẽ yêu cầu đổi mật khẩu.
Logo khi phát triển: đặt vào `frontend/public/brand/logo.svg` (thư mục này không commit).
