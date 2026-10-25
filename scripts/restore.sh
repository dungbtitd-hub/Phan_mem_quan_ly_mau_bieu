#!/usr/bin/env bash
# CẢNH BÁO: ghi đè dữ liệu hiện có. Dùng: ./scripts/restore.sh <db.dump> <files.tar.gz>
set -euo pipefail
[ $# -eq 2 ] || { echo "Cách dùng: $0 <db.dump> <files.tar.gz>"; exit 1; }
read -r -p "Thao tác sẽ GHI ĐÈ database và kho tệp hiện tại. Gõ 'DONG Y' để tiếp tục: " ok
[ "$ok" = "DONG Y" ] || { echo "Đã hủy."; exit 1; }
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < "$1"
docker compose run --rm --no-deps -T -v "$(cd "$(dirname "$2")" && pwd)":/backup api \
  sh -c "rm -rf /data/files/* && tar -C /data/files -xzf /backup/$(basename "$2")"
echo "Đã phục hồi. Hãy kiểm tra /health và đối chiếu SHA-256 tệp."
