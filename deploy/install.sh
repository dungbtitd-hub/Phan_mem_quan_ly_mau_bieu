#!/usr/bin/env bash
# Cài đặt / khởi động Cổng quản lý mẫu biểu. Chạy trong thư mục giải nén gói cài đặt:
#   sudo ./install.sh
# Chạy lại nhiều lần an toàn: không ghi đè .env, chứng chỉ, dữ liệu đã có.
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n>> %s\n' "$*"; }
die() { printf '\nLỖI: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || die "Chưa cài Docker. Xem mục 2 trong HUONG-DAN-CAI-DAT.md"
docker compose version >/dev/null 2>&1 || die "Chưa có Docker Compose v2 (lệnh 'docker compose')."
docker info >/dev/null 2>&1 || die "Không kết nối được Docker daemon (chạy bằng sudo hoặc thêm user vào nhóm docker)."

VERSION="$(cat VERSION 2>/dev/null || true)"

# 1. Nạp image từ gói offline (nếu có)
if [ -f images.tar.gz ]; then
  say "Nạp Docker image từ images.tar.gz (có thể mất vài phút)"
  gunzip -c images.tar.gz | docker load
fi

# 2. Tạo .env nếu chưa có
if [ ! -f .env ]; then
  say "Tạo tệp cấu hình .env với mật khẩu ngẫu nhiên"
  gen() { (set +o pipefail; LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$1"); }
  DBPW="$(gen 32)"
  ADMINPW="Fp-$(gen 6)@$(gen 8)"
  sed -e "s/^FP_VERSION=.*/FP_VERSION=${VERSION:-latest}/" \
      -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=${DBPW}/" \
      -e "s/^ADMIN_INITIAL_PASSWORD=.*/ADMIN_INITIAL_PASSWORD=${ADMINPW}/" \
      .env.example > .env
  chmod 600 .env
  NEW_ADMIN_PW="$ADMINPW"
elif [ -n "$VERSION" ]; then
  sed -i "s/^FP_VERSION=.*/FP_VERSION=${VERSION}/" .env
fi
grep -q '__TU_SINH__\|__FP_VERSION__' .env && die "Tệp .env còn giá trị mẫu (__TU_SINH__/__FP_VERSION__). Hãy sửa lại."

# 3. Chứng chỉ TLS
if [ ! -f certs/server.crt ] || [ ! -f certs/server.key ]; then
  say "Chưa có chứng chỉ trong certs/. Tạo chứng chỉ TỰ KÝ tạm thời (nên thay bằng chứng chỉ của đơn vị)."
  ./gen-selfsigned-cert.sh
fi

# Thư mục logo (đặt logo.svg hoặc logo.png vào đây bất kỳ lúc nào)
mkdir -p branding

# 4. Khởi động
say "Khởi động dịch vụ"
docker compose up -d

say "Chờ hệ thống sẵn sàng"
set -a; . ./.env; set +a
for i in $(seq 1 60); do
  st="$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q web)" 2>/dev/null || true)"
  [ "$st" = "healthy" ] && break
  if [ "$(docker inspect -f '{{.State.ExitCode}}' "$(docker compose ps -aq migrate)" 2>/dev/null || echo 0)" != "0" ]; then
    docker compose logs migrate | tail -30; die "Migration database lỗi (xem log ở trên)."
  fi
  sleep 3
done
[ "$st" = "healthy" ] || { docker compose ps; docker compose logs --tail 50 api; die "Hệ thống chưa sẵn sàng sau 3 phút."; }

docker compose ps
HOST="$(hostname -f 2>/dev/null || hostname)"
PORT_SUFFIX=""; [ "${HTTPS_PORT:-443}" != "443" ] && PORT_SUFFIX=":${HTTPS_PORT}"
say "HOÀN TẤT. Truy cập: https://${HOST}${PORT_SUFFIX}/"
if [ -n "${NEW_ADMIN_PW:-}" ]; then
  echo "   Tài khoản Admin khởi tạo: ${ADMIN_INITIAL_USERNAME:-admin}"
  echo "   Mật khẩu tạm:            ${NEW_ADMIN_PW}"
  echo "   (Lưu trong tệp .env; hệ thống bắt buộc đổi mật khẩu ở lần đăng nhập đầu.)"
fi
