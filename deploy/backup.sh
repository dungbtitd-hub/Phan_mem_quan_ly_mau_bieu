#!/usr/bin/env bash
# Sao lưu database và kho tệp cùng thời điểm. Dùng: ./backup.sh [thư_mục_đích]
# Nên đặt lịch hằng ngày (cron), ví dụ: 0 1 * * * cd /opt/formportal && ./backup.sh /backup/formportal
set -euo pipefail
cd "$(dirname "$0")"
DEST="${1:-./backups}"; TS="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$DEST"; DEST="$(cd "$DEST" && pwd)"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$DEST/db_$TS.dump"
docker compose run --rm --no-deps -T -u root -v "$DEST":/backup --entrypoint tar api \
  -C /data/files -czf "/backup/files_$TS.tar.gz" .
( cd "$DEST" && sha256sum "db_$TS.dump" "files_$TS.tar.gz" > "SHA256_$TS.txt" )
echo "Đã tạo: $DEST/db_$TS.dump, $DEST/files_$TS.tar.gz, $DEST/SHA256_$TS.txt"
