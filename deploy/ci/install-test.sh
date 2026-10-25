#!/usr/bin/env bash
# KIỂM THỬ CÀI ĐẶT TRÊN MÁY SẠCH, GIẢ LẬP MÁY CHỦ KHÔNG CÓ INTERNET.
# Làm đúng theo docs/HUONG-DAN-CAI-DAT.md với gói offline, rồi thử: khởi động lại Docker,
# sao lưu/phục hồi, cập nhật phiên bản, quay lại bản cũ.
# Dùng (cần sudo, Docker đã chặn tải image): ./install-test.sh <formportal-X-offline.tar.gz> <sample.docx>
set -euo pipefail
PKG="$(readlink -f "$1")"; SAMPLE="$(readlink -f "$2")"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT=/opt/formportal
NAME="$(basename "$PKG" -offline.tar.gz)"
VERSION="${NAME#formportal-}"
PASS1='KiemThu@2026x'
J="$(mktemp)"
C=(curl -sS -k -b "$J" -c "$J" --fail-with-body)
csrf() { "${C[@]}" https://localhost/api/auth/csrf | sed -E 's/.*"token":"([^"]+)".*/\1/'; }
login() { local t; t="$(csrf)"; "${C[@]}" -o /dev/null -H "X-CSRF-TOKEN: $t" -H 'Content-Type: application/json' \
  -d "{\"username\":\"admin\",\"password\":\"$1\"}" https://localhost/api/auth/login; }
apps() { "${C[@]}" "https://localhost/api/applications?pageSize=100"; }
step() { printf '\n\033[1m######## %s\033[0m\n' "$*"; }
ok() { printf '   ĐẠT: %s\n' "$*"; }
fail() { printf '   LỖI: %s\n' "$*"; exit 1; }

step "0. Xác nhận Docker KHÔNG tải được image từ Internet (giả lập máy chủ offline)"
if timeout 60 sudo docker pull -q hello-world >/dev/null 2>&1; then fail "Docker vẫn tải được image, môi trường chưa offline"; fi
ok "docker pull bị chặn"
[ -z "$(sudo docker images -q)" ] || fail "Máy còn sẵn image, chưa sạch"
ok "Không có image nào sẵn trên máy"

step "1. Giải nén bộ cài vào $ROOT (mục 5 hướng dẫn)"
sudo mkdir -p "$ROOT" && cd "$ROOT"
sudo tar -xzf "$PKG"
cd "$ROOT/$NAME"; ls -la

step "2. sudo ./install.sh"
sudo ./install.sh | tee /tmp/install.log
ADMIN_PW="$(sed -n 's/.*Mật khẩu tạm: *//p' /tmp/install.log)"
[ -n "$ADMIN_PW" ] || fail "install.sh không in mật khẩu Admin"
sudo test "$(sudo stat -c %a .env)" = 600 || fail ".env không ở quyền 600"
ok "Cài đặt xong, .env quyền 600"

step "3. Chạy lại install.sh (phải an toàn, không đổi mật khẩu)"
sudo ./install.sh >/tmp/install2.log
grep -q "Mật khẩu tạm" /tmp/install2.log && fail "Chạy lại đã tạo mật khẩu mới"
ok "Chạy lại idempotent"

step "4. Kiểm thử chức năng qua HTTPS"
BASE=https://localhost ADMIN_USER=admin ADMIN_PASS="$ADMIN_PW" NEW_PASS="$PASS1" "$HERE/smoke-test.sh" "$SAMPLE"
code="$(curl -s -o /dev/null -w '%{http_code}' http://localhost/)"; [ "$code" = 301 ] || fail "HTTP không chuyển sang HTTPS ($code)"
ok "HTTP 80 chuyển hướng sang HTTPS"
for p in 5432 8080; do (exec 3<>/dev/tcp/127.0.0.1/$p) 2>/dev/null && fail "Cổng $p mở ra ngoài (không mong muốn)"; done
ok "Database và API không mở cổng ra ngoài"

step "5. Logo động: đặt branding/logo.svg không cần khởi động lại"
code="$(curl -sk -o /dev/null -w '%{http_code}' https://localhost/brand/logo.svg)"; [ "$code" = 404 ] || fail "Chưa có logo phải trả 404 ($code)"
echo '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' | sudo tee branding/logo.svg >/dev/null
code="$(curl -sk -o /dev/null -w '%{http_code}' https://localhost/brand/logo.svg)"; [ "$code" = 200 ] || fail "Logo không hiển thị ($code)"
ok "Logo hiển thị ngay"

step "6. Khởi động lại Docker (giả lập khởi động lại máy chủ): dịch vụ tự chạy lại, dữ liệu còn"
if [ -n "${DOCKER_RESTART_CMD:-}" ]; then eval "$DOCKER_RESTART_CMD"; else sudo systemctl restart docker; fi
for i in $(seq 1 60); do
  [ "$(sudo docker inspect -f '{{.State.Health.Status}}' formportal-web-1 2>/dev/null)" = healthy ] && break; sleep 3
done
sudo docker compose ps
login "$PASS1"; apps | grep -q SMOKE || fail "Mất dữ liệu sau khởi động lại"
ok "Tự khởi động lại, đăng nhập bằng mật khẩu đã đổi, dữ liệu còn nguyên"

step "7. Sao lưu, thay đổi dữ liệu, phục hồi"
sudo ./backup.sh /tmp/fp-backup
DUMP="$(ls /tmp/fp-backup/db_*.dump | tail -1)"; FILES="$(ls /tmp/fp-backup/files_*.tar.gz | tail -1)"
(cd /tmp/fp-backup && sha256sum -c SHA256_*.txt)
t="$(csrf)"; "${C[@]}" -o /dev/null -H "X-CSRF-TOKEN: $t" -H 'Content-Type: application/json' \
  -d '{"code":"SAU-SAO-LUU","name":"Tạo sau khi sao lưu"}' https://localhost/api/applications
apps | grep -q SAU-SAO-LUU || fail "Không tạo được dữ liệu thử"
echo "DONG Y" | sudo ./restore.sh "$DUMP" "$FILES"
for i in $(seq 1 60); do [ "$(sudo docker inspect -f '{{.State.Health.Status}}' formportal-web-1)" = healthy ] && break; sleep 3; done
login "$PASS1"
apps | grep -q SAU-SAO-LUU && fail "Phục hồi không đưa dữ liệu về thời điểm sao lưu"
apps | grep -q SMOKE || fail "Mất dữ liệu sau phục hồi"
FORM="$("${C[@]}" "https://localhost/api/forms?pageSize=10" | sed -E 's/.*"items":\[\{"id":"([^"]+)".*/\1/')"
VER="$("${C[@]}" "https://localhost/api/forms/$FORM/versions" | sed -E 's/.*"id":"([^"]+)".*/\1/')"
"${C[@]}" -o /dev/null "https://localhost/api/versions/$VER/download" || fail "Tệp mẫu biểu không tải được sau phục hồi"
ok "Phục hồi đúng database và kho tệp"

step "8. Cập nhật lên phiên bản mới (mục 12), dữ liệu giữ nguyên"
NEXT="${VERSION}-next"; P="$(sudo grep '^FP_IMAGE_PREFIX=' .env | cut -d= -f2)"
NEWDIR="$ROOT/formportal-$NEXT"; sudo mkdir -p "$NEWDIR"
sudo cp "$ROOT/$NAME"/*.sh "$ROOT/$NAME"/docker-compose.yml "$ROOT/$NAME"/.env.example "$NEWDIR/"
echo "$NEXT" | sudo tee "$NEWDIR/VERSION" >/dev/null
for img in api web migrate; do sudo docker tag "$P/$img:$VERSION" "$P/$img:$NEXT"; done
sudo docker save "$P/api:$NEXT" "$P/web:$NEXT" "$P/migrate:$NEXT" | gzip -1 | sudo tee "$NEWDIR/images.tar.gz" >/dev/null
for img in api web migrate; do sudo docker rmi "$P/$img:$NEXT" >/dev/null; done
cd "$NEWDIR"
sudo cp -a "$ROOT/$NAME/.env" "$ROOT/$NAME/certs" "$ROOT/$NAME/branding" .
sudo ./update.sh
for i in $(seq 1 60); do [ "$(sudo docker inspect -f '{{.State.Health.Status}}' formportal-web-1)" = healthy ] && break; sleep 3; done
sudo docker compose ps --format '{{.Service}} {{.Image}}' | grep -q ":$NEXT" || fail "Chưa chạy image phiên bản mới"
login "$PASS1"; apps | grep -q SMOKE || fail "Mất dữ liệu sau cập nhật"
ls backups/db_*.dump >/dev/null || fail "update.sh không tự sao lưu"
ok "Cập nhật thành công, có bản sao lưu tự động, dữ liệu còn"

step "9. Quay lại phiên bản cũ"
cd "$ROOT/$NAME" && sudo ./install.sh >/dev/null
sudo docker compose ps --format '{{.Service}} {{.Image}}' | grep -q ":$VERSION\$" || fail "Chưa quay lại image cũ"
login "$PASS1"; apps | grep -q SMOKE || fail "Mất dữ liệu sau khi quay lại"
ok "Quay lại bản cũ thành công"

printf '\n\033[1m==== KIỂM THỬ CÀI ĐẶT OFFLINE: TẤT CẢ ĐẠT ====\033[0m\n'
