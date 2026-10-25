#!/usr/bin/env bash
# Sao lưu database và kho tệp cùng một thời điểm. Dùng: ./scripts/backup.sh [thư_mục_đích]
set -euo pipefail
DEST="${1:-./backups}"; TS="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$DEST"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$DEST/db_$TS.dump"
docker compose run --rm --no-deps -T -v "$(cd "$DEST" && pwd)":/backup api \
  tar -C /data/files -czf "/backup/files_$TS.tar.gz" .
( cd "$DEST" && sha256sum "db_$TS.dump" "files_$TS.tar.gz" > "SHA256_$TS.txt" )
echo "Đã tạo: $DEST/db_$TS.dump, $DEST/files_$TS.tar.gz"
