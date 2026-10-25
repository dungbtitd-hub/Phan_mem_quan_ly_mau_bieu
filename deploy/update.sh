#!/usr/bin/env bash
# Cập nhật lên phiên bản mới. Chạy trong thư mục của gói MỚI sau khi chép .env, certs/ từ bản cũ sang:
#   sudo ./update.sh
# Hoặc chạy trong thư mục đang cài (gói online): sudo ./update.sh <phiên_bản>
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || { echo "Chưa có .env. Chép .env và thư mục certs/ từ thư mục cài đặt cũ sang đây."; exit 1; }
NEW="${1:-$(cat VERSION 2>/dev/null || true)}"
[ -n "$NEW" ] || { echo "Không xác định được phiên bản mới."; exit 1; }
echo ">> Sao lưu trước khi cập nhật"
./backup.sh ./backups
if [ -f images.tar.gz ]; then gunzip -c images.tar.gz | docker load; fi
OLD="$(grep '^FP_VERSION=' .env | cut -d= -f2)"
sed -i "s/^FP_VERSION=.*/FP_VERSION=${NEW}/" .env
[ -f images.tar.gz ] || docker compose pull
docker compose up -d
echo ">> Đã cập nhật ${OLD} -> ${NEW}. Quay lại bản cũ: sửa FP_VERSION=${OLD} trong .env rồi 'docker compose up -d'"
echo "   (nếu bản mới có migration database, cần phục hồi bản sao lưu vừa tạo bằng restore.sh)."
