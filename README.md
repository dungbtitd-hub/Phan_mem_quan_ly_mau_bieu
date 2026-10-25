# Cổng quản lý mẫu biểu ứng dụng

Trạng thái: đã có database (Bước 3) và mã nguồn backend (Bước 4, chưa biên dịch/chạy thử). Frontend đã có mã nguồn (Bước 5, chưa build/chạy thử). Dockerfile api/web và nginx sẽ bổ sung.

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
`./scripts/backup.sh` và `./scripts/restore.sh` (phục hồi sẽ ghi đè dữ liệu và yêu cầu xác nhận). Cần dịch vụ `api` (bước sau) có volume `/data/files`.

## Chạy backend (local, cần .NET SDK 10)
```bash
cd backend/src/Api
dotnet --version                      # xác nhận SDK; nếu dùng bản khác, sửa TargetFramework trong .csproj
dotnet restore                        # sinh packages.lock.json, hãy commit file này
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
npm install                 # sinh package-lock.json, hãy commit file này
npm run typecheck           # kiểm tra kiểu TypeScript
npm run dev                 # http://localhost:5173, tự chuyển /api và /health tới http://localhost:5000
# Backend ở cổng khác: API_TARGET=http://localhost:PORT npm run dev
npm run build               # xuất bản build tĩnh vào frontend/dist
```
Chạy backend trước (xem phần trên) rồi mở http://localhost:5173. Đăng nhập bằng tài khoản Admin khởi tạo; hệ thống sẽ yêu cầu đổi mật khẩu.
Logo chính thức: đặt vào `frontend/public/brand/logo.svg`.
