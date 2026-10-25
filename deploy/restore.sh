#!/usr/bin/env bash
# CẢNH BÁO: ghi đè dữ liệu hiện có. Dùng: ./restore.sh <db_xxx.dump> <files_xxx.tar.gz>
set -euo pipefail
cd "$(dirname "$0")"
[ $# -eq 2 ] || { echo "Cách dùng: $0 <db.dump> <files.tar.gz>"; exit 1; }
DUMP="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
FILES_DIR="$(cd "$(dirname "$2")" && pwd)"; FILES_NAME="$(basename "$2")"
read -r -p "Thao tác sẽ GHI ĐÈ database và kho tệp hiện tại. Gõ 'DONG Y' để tiếp tục: " ok
[ "$ok" = "DONG Y" ] || { echo "Đã hủy."; exit 1; }
docker compose stop web api
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < "$DUMP"
docker compose run --rm --no-deps -T -u root -v "$FILES_DIR":/backup --entrypoint sh api \
  -c "find /data/files -mindepth 1 -delete && tar -C /data/files -xzf /backup/$FILES_NAME && chown -R \$APP_UID:\$APP_UID /data/files"
docker compose up -d
echo "Đã phục hồi. Kiểm tra trang web và đối chiếu SHA-256 tệp sao lưu."
