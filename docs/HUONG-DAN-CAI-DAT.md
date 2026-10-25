# HƯỚNG DẪN CÀI ĐẶT CỔNG QUẢN LÝ MẪU BIỂU TRÊN MÁY CHỦ

Tài liệu dành cho cán bộ quản trị hệ thống. Các lệnh chạy trên máy chủ Linux bằng tài khoản có quyền `sudo`.

---

## 1. Bộ cài gồm những gì

Mỗi phiên bản được phát hành trên trang **Releases** của repo GitHub, gồm 3 tệp:

| Tệp | Dùng khi |
|---|---|
| `formportal-<phiên bản>-offline.tar.gz` | Máy chủ **không có Internet**. Đã kèm sẵn toàn bộ Docker image. **Khuyến nghị.** |
| `formportal-<phiên bản>-online.tar.gz` | Máy chủ có Internet và đăng nhập được `ghcr.io`. Image tải về khi cài. |
| `formportal-<phiên bản>-SHA256SUMS.txt` | Mã kiểm tra toàn vẹn của 2 tệp trên. |

Giải nén ra thư mục `formportal-<phiên bản>/`:

| Tệp | Chức năng |
|---|---|
| `install.sh` | Cài đặt lần đầu / khởi động lại (chạy lại nhiều lần an toàn) |
| `update.sh` | Cập nhật lên phiên bản mới (tự sao lưu trước) |
| `backup.sh`, `restore.sh` | Sao lưu và phục hồi database + kho tệp |
| `gen-selfsigned-cert.sh` | Tạo chứng chỉ HTTPS tự ký (dùng tạm) |
| `docker-compose.yml` | Khai báo các dịch vụ |
| `.env.example` | Mẫu cấu hình; `install.sh` tạo `.env` từ tệp này |
| `images.tar.gz` | (chỉ gói offline) Docker image đóng gói sẵn |
| `VERSION` | Số phiên bản |

Hệ thống chạy 4 container:

```
Trình duyệt ──HTTPS 443──> web (Nginx + giao diện) ──> api (ASP.NET Core) ──> db (PostgreSQL 16)
                                                         └──> kho tệp (volume riêng)
migrate: chạy một lần mỗi khi khởi động để cập nhật cấu trúc database, rồi tự thoát.
clamav : (tùy chọn) quét mã độc tệp tải lên.
```

Chỉ container `web` mở cổng ra ngoài (80, 443). Database và API không truy cập trực tiếp được từ mạng.

---

## 2. Yêu cầu máy chủ

| Hạng mục | Tối thiểu (≈150 người dùng) |
|---|---|
| Hệ điều hành | Linux 64-bit x86_64: Ubuntu 22.04/24.04, Debian 12, RHEL/Rocky/Alma 8–9, Oracle Linux 8–9 |
| CPU / RAM | 2 vCPU / 4 GB (khuyến nghị 4 vCPU / 8 GB; thêm 2 GB nếu bật ClamAV) |
| Ổ đĩa | 50 GB trống cho `/var/lib/docker` (dữ liệu + kho tệp), cộng dung lượng cho bản sao lưu |
| Phần mềm | Docker Engine 24 trở lên, Docker Compose v2 (lệnh `docker compose`) |
| Mạng | Mở cổng 443 (và 80 để tự chuyển sang HTTPS) từ mạng nội bộ tới máy chủ |
| Tên miền | Nên có tên miền nội bộ, ví dụ `maubieu.donvi.local`, trỏ về IP máy chủ |
| Chứng chỉ | Chứng chỉ TLS cho tên miền trên (do CA nội bộ cấp). Chưa có thì dùng tạm chứng chỉ tự ký |

---

## 3. Cài Docker (nếu máy chủ chưa có)

Kiểm tra:

```bash
docker --version
docker compose version
```

**Máy chủ có Internet (Ubuntu/Debian/RHEL):**

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker
```

**Máy chủ không có Internet:** trên một máy có Internet, tải các gói `.deb`/`.rpm` của `docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-compose-plugin` đúng phiên bản hệ điều hành từ https://download.docker.com/linux/, chép sang máy chủ rồi cài:

```bash
# Ubuntu/Debian
sudo dpkg -i ./*.deb
# RHEL/Rocky/Alma/Oracle
sudo dnf install -y ./*.rpm
sudo systemctl enable --now docker
```

> Nếu đơn vị dùng Podman thay Docker: chưa được kiểm thử, nên dùng Docker Engine.

---

## 4. Tải và chép bộ cài lên máy chủ

1. Mở repo trên GitHub → **Releases** → chọn phiên bản mới nhất → tải 3 tệp ở mục 1.
   (Bản build chưa phát hành: **Actions** → workflow **release** → lần chạy thành công → mục **Artifacts**.)
2. Kiểm tra toàn vẹn (trên máy tải về hoặc trên máy chủ):

   ```bash
   sha256sum -c formportal-<phiên bản>-SHA256SUMS.txt --ignore-missing
   ```
   Kết quả phải là `OK`.
3. Chép lên máy chủ, ví dụ:

   ```bash
   scp formportal-0.1.0-offline.tar.gz quantri@maychu:/tmp/
   ```

---

## 4b. Cài thử trên máy ảo trước khi cài thật (khuyến nghị)

Mỗi bộ cài trước khi phát hành đã được GitHub Actions cài thử tự động trên máy ảo sạch Ubuntu 22.04 và 24.04, **chặn Internet**, theo đúng các bước trong tài liệu này (script `deploy/ci/install-test.sh`): cài đặt, chạy lại, kiểm thử chức năng qua HTTPS, khởi động lại Docker, sao lưu/phục hồi, cập nhật phiên bản, quay lại bản cũ. Kết quả xem ở tab **Actions** của repo, job "Kiểm thử cài đặt offline".

Để chắc chắn trên đúng hệ điều hành của đơn vị, nên cài thử một lần trên máy ảo (VMware/Hyper-V/VirtualBox) dùng **cùng bản hệ điều hành** với máy chủ thật:

1. Tạo máy ảo 2 vCPU, 4 GB RAM, 40 GB đĩa; cài hệ điều hành và Docker (mục 3).
2. Ngắt mạng Internet của máy ảo (chỉ giữ mạng nội bộ để chép tệp), làm mục 4–6.
3. Thử các thao tác vận hành: mục 8 (logo), 10, 11 (sao lưu rồi phục hồi), khởi động lại máy ảo và kiểm tra hệ thống tự chạy lại.
4. Có thể chạy cùng bộ kiểm thử tự động: chép `deploy/ci/install-test.sh`, `deploy/ci/smoke-test.sh`, `deploy/ci/sample.docx` từ repo vào máy ảo rồi chạy
   `./install-test.sh /đường/dẫn/formportal-<phiên bản>-offline.tar.gz ./sample.docx` (cần máy sạch, chưa có image Docker; script cài vào `/opt/formportal`).

---

## 5. Cài đặt lần đầu

```bash
sudo mkdir -p /opt/formportal && cd /opt/formportal
sudo tar -xzf /tmp/formportal-0.1.0-offline.tar.gz
cd formportal-0.1.0
```

**(Khuyến nghị) Đặt chứng chỉ của đơn vị trước khi cài** — xem mục 7. Nếu bỏ qua, `install.sh` tự tạo chứng chỉ tự ký.

**(Tùy chọn) Sửa cấu hình trước khi cài:** `sudo cp .env.example .env && sudo nano .env` (đổi cổng, tên Admin…). Nếu không, `install.sh` tự tạo `.env` với mật khẩu ngẫu nhiên.

Chạy cài đặt:

```bash
sudo ./install.sh
```

Script sẽ: nạp image (gói offline, mất vài phút) → tạo `.env` → tạo chứng chỉ (nếu chưa có) → khởi tạo database → khởi động dịch vụ → chờ hệ thống sẵn sàng. Khi xong sẽ in ra:

```
>> HOÀN TẤT. Truy cập: https://maubieu.donvi.local/
   Tài khoản Admin khởi tạo: admin
   Mật khẩu tạm:            Fp-xxxxxx@xxxxxxxx
```

**Ghi lại mật khẩu tạm.** Nó cũng được lưu trong `.env` (dòng `ADMIN_INITIAL_PASSWORD`).

**Gói online:** nếu image trên ghcr.io để riêng tư, đăng nhập trước khi cài bằng Personal Access Token có quyền `read:packages`:

```bash
echo <TOKEN> | sudo docker login ghcr.io -u <tài_khoản_github> --password-stdin
sudo ./install.sh
```

Mở tường lửa (nếu có):

```bash
# Ubuntu (ufw)
sudo ufw allow 443/tcp && sudo ufw allow 80/tcp
# RHEL (firewalld)
sudo firewall-cmd --permanent --add-service=https --add-service=http && sudo firewall-cmd --reload
```

---

## 6. Đăng nhập lần đầu và thiết lập ban đầu

1. Mở trình duyệt: `https://<tên miền hoặc IP máy chủ>/`. Với chứng chỉ tự ký, trình duyệt sẽ cảnh báo, chọn tiếp tục (hoặc cài chứng chỉ vào máy người dùng).
2. Đăng nhập `admin` / mật khẩu tạm → hệ thống **bắt buộc đổi mật khẩu** (≥10 ký tự, có ít nhất 3 loại: chữ thường, chữ hoa, số, ký tự đặc biệt; không chứa tên đăng nhập).
3. Vào **Quản lý người dùng**: tạo thêm **một Admin dự phòng**, các **Người phê duyệt** và **Người dùng**. Mật khẩu tạm của tài khoản mới chỉ hiển thị một lần, hãy chuyển cho người dùng qua kênh an toàn.
4. Vào **Quản lý hệ thống ứng dụng**: tạo các hệ thống, phân quyền xem cho người dùng/nhóm.
5. Vào **Quản lý mẫu biểu**: tải lên mẫu biểu (docx, xlsx, pdf, doc, xls; tối đa 30 MB; tệp có macro bị chặn) → gửi phê duyệt → Người phê duyệt duyệt → người dùng thấy và tải được.

Sau khi đã đổi mật khẩu Admin, có thể xóa giá trị dòng `ADMIN_INITIAL_PASSWORD` trong `.env` (chỉ dùng ở lần khởi tạo đầu).

---

## 7. Chứng chỉ HTTPS của đơn vị

Đặt 2 tệp vào thư mục `certs/` cạnh `docker-compose.yml`:

| Tệp | Nội dung |
|---|---|
| `certs/server.crt` | Chứng chỉ máy chủ **kèm chuỗi CA trung gian** (định dạng PEM, chứng chỉ máy chủ đứng đầu) |
| `certs/server.key` | Khóa riêng (PEM, không đặt mật khẩu) |

```bash
sudo cp maubieu.crt certs/server.crt
sudo cp maubieu.key certs/server.key
sudo chown 101 certs/server.key && sudo chmod 640 certs/server.key   # Nginx trong container chạy bằng UID 101
sudo docker compose restart web
```

Có file `.pfx`? Chuyển đổi:

```bash
openssl pkcs12 -in maubieu.pfx -clcerts -nokeys -out certs/server.crt
openssl pkcs12 -in maubieu.pfx -nocerts -nodes -out certs/server.key
```

Tạo lại chứng chỉ tự ký theo tên miền/IP cụ thể: `sudo ./gen-selfsigned-cert.sh maubieu.donvi.local 10.0.0.15 && sudo docker compose restart web`.

---

## 8. Logo, biểu tượng và tên đơn vị (thay bất kỳ lúc nào)

Nhận diện **không** đóng gói trong phần mềm mà nằm ở thư mục `branding/` cạnh `docker-compose.yml`. Bộ cài kèm sẵn logo Agribank và tên đơn vị "Chi nhánh Gia Lâm – Phòng Kế toán Ngân quỹ":

| Tệp | Hiển thị |
|---|---|
| `branding/logo.svg` (ưu tiên) hoặc `logo.png` / `logo.webp` / `logo.jpg` | Logo ở đầu thanh bên trái và trên dải đỏ của trang đăng nhập. Dùng ảnh **nền trong suốt, chữ sáng**, tỉ lệ ngang. Nên dùng tệp SVG chính thức để sắc nét. |
| `branding/favicon.png` | Biểu tượng trên tab trình duyệt (64×64 px) |
| `branding/config.json` | Các dòng chữ dưới logo (tối đa 3 dòng) |

Ví dụ `config.json` (lưu mã hóa UTF-8):

```json
{
  "unitLines": ["Chi nhánh Gia Lâm", "Phòng Kế toán Ngân quỹ"]
}
```

Thay logo: `sudo cp logo-chinh-thuc.svg branding/logo.svg` (tệp `.svg` được ưu tiên hơn `logo.png` có sẵn). Không cần khởi động lại; người dùng tải lại trang (Ctrl+F5) là thấy. Xóa hết tệp logo thì giao diện hiển thị ô giữ chỗ "LOGO"; xóa `config.json` thì dưới logo hiện "Quản lý mẫu biểu".

---

## 9. Quét mã độc ClamAV (tùy chọn)

Sửa `.env`:

```
COMPOSE_PROFILES=clamav
CLAMAV_ENABLED=true
```

Rồi `sudo docker compose up -d`. Lần đầu ClamAV cần tải cơ sở dữ liệu virus (cần Internet hoặc mirror nội bộ), mất 5–15 phút; trong thời gian đó việc tải lên sẽ bị từ chối với thông báo "không quét được" (an toàn theo thiết kế). Với máy chủ không có Internet, đơn vị cần mirror cơ sở dữ liệu ClamAV nội bộ hoặc dùng công cụ quét sẵn có.

---

## 10. Vận hành hằng ngày

Mọi lệnh chạy trong thư mục cài đặt (ví dụ `/opt/formportal/formportal-0.1.0`):

| Việc | Lệnh |
|---|---|
| Xem trạng thái | `sudo docker compose ps` (các dịch vụ phải `healthy`; `migrate` ở trạng thái `Exited (0)` là bình thường) |
| Xem log | `sudo docker compose logs -f api` (hoặc `web`, `db`) |
| Kiểm tra sức khỏe | `curl -k https://localhost/health/ready` → `{"status":"ok","database":"ok"}` |
| Dừng | `sudo docker compose stop` |
| Khởi động | `sudo docker compose up -d` |
| Khởi động lại | `sudo docker compose restart` |

Các dịch vụ tự khởi động lại khi máy chủ khởi động lại (cần `sudo systemctl enable docker`).

Nhật ký hoạt động nghiệp vụ (đăng nhập, tải lên, phê duyệt, tải xuống…) xem trong giao diện: **Nhật ký hoạt động**.

---

## 11. Sao lưu và phục hồi

**Sao lưu** (database + kho tệp cùng thời điểm, kèm mã SHA-256):

```bash
sudo ./backup.sh /backup/formportal
```

**Đặt lịch hằng ngày lúc 1 giờ sáng** (`sudo crontab -e`):

```
0 1 * * * cd /opt/formportal/formportal-0.1.0 && ./backup.sh /backup/formportal >> /var/log/formportal-backup.log 2>&1
0 3 * * * find /backup/formportal -type f -mtime +30 -delete
```

Chép thư mục sao lưu sang máy/ổ lưu trữ khác. Sao lưu thêm tệp `.env` và thư mục `certs/` (chứa mật khẩu và khóa, cần bảo vệ).

**Phục hồi** (GHI ĐÈ dữ liệu hiện tại, có hỏi xác nhận):

```bash
sudo ./restore.sh /backup/formportal/db_20261025T010000Z.dump /backup/formportal/files_20261025T010000Z.tar.gz
```

Nên diễn tập phục hồi định kỳ trên một máy chủ thử nghiệm.

---

## 12. Cập nhật phiên bản mới

```bash
cd /opt/formportal
sudo tar -xzf /tmp/formportal-0.2.0-offline.tar.gz
cd formportal-0.2.0
# Chép cấu hình, chứng chỉ, logo từ bản đang chạy
sudo cp -a ../formportal-0.1.0/.env ../formportal-0.1.0/certs ../formportal-0.1.0/branding .
sudo ./update.sh
```

`update.sh` tự sao lưu vào `./backups`, nạp image mới, cập nhật database và khởi động lại. Dữ liệu nằm trong Docker volume (tên dự án `formportal`) nên dùng chung giữa các thư mục phiên bản. Nhớ sửa đường dẫn trong cron sao lưu sang thư mục mới.

**Quay lại bản cũ:** `cd ../formportal-0.1.0 && sudo ./install.sh`. Nếu bản mới đã thay đổi database thì phục hồi bản sao lưu vừa tạo bằng `restore.sh` trước.

---

## 13. Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `install.sh` báo "Chưa cài Docker" / "Không kết nối được Docker daemon" | Chưa cài hoặc chưa chạy Docker, hoặc chạy không có `sudo` | Mục 3; `sudo systemctl start docker`; chạy bằng `sudo` |
| "Migration database lỗi" | `.env` sai mật khẩu so với lần cài trước, hoặc lỗi SQL | `sudo docker compose logs migrate`. Không đổi `POSTGRES_PASSWORD` sau khi đã cài |
| `api` không `healthy` | Database chưa sẵn sàng; thiếu mật khẩu Admin khởi tạo | `sudo docker compose logs api` |
| Trình duyệt báo lỗi chứng chỉ | Chứng chỉ tự ký hoặc sai tên miền | Mục 7 |
| Mở trang bị từ chối kết nối | Tường lửa chưa mở 443, hoặc cổng 80/443 đã bị dịch vụ khác dùng | Mục 5; đổi `HTTP_PORT`/`HTTPS_PORT` trong `.env` rồi `docker compose up -d` |
| Đăng nhập báo "Phiên làm việc không hợp lệ…" | Trang mở quá lâu, cookie hết hạn | Tải lại trang (F5) |
| Tải lên báo quá lớn | Tệp > 30 MB | Giảm dung lượng tệp |
| Tải lên báo "nội dung không khớp" | Đổi đuôi tệp, hoặc tệp có macro (VBA) | Lưu lại đúng định dạng, bỏ macro |
| Quên mật khẩu Admin duy nhất | — | Dùng Admin dự phòng để "Đặt lại mật khẩu". Vì vậy luôn tạo ít nhất 2 Admin |
| Tài khoản bị khóa tạm | Nhập sai mật khẩu 5 lần | Chờ 15 phút hoặc Admin mở khóa |

Khi báo lỗi cho bộ phận phát triển, gửi kèm: phiên bản (`cat VERSION`), `sudo docker compose ps`, `sudo docker compose logs --tail 200 api web` và **mã yêu cầu** hiển thị trên thông báo lỗi.

---

## 14. Khuyến nghị bảo mật

- Chỉ mở cổng 443 (và 80) cho mạng nội bộ cần dùng; không mở ra Internet.
- Bảo vệ tệp `.env` (đã đặt quyền 600) và `certs/server.key`; không gửi qua email.
- Dùng chứng chỉ do CA nội bộ cấp thay cho chứng chỉ tự ký.
- Không đặt `MIGRATE_ARGS=--seed-demo` trên môi trường thật (chỉ dùng thử nghiệm).
- Cập nhật hệ điều hành và Docker định kỳ; cập nhật phần mềm khi có phiên bản mới.
- Đối chiếu với chính sách ATTT/CNTT nội bộ của đơn vị trước khi đưa vào sử dụng chính thức.

---

## 15. Gỡ cài đặt

```bash
sudo docker compose down          # dừng và xóa container, GIỮ dữ liệu
sudo docker compose down -v       # XÓA LUÔN dữ liệu (database, kho tệp) — không thể khôi phục nếu không có bản sao lưu
```
