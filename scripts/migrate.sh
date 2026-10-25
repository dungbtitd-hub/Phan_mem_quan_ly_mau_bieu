#!/usr/bin/env bash
# Áp dụng tuần tự các migration chưa chạy. Dùng: DATABASE_URL=... ./scripts/migrate.sh [--seed-demo]
set -euo pipefail
: "${DATABASE_URL:?Cần đặt DATABASE_URL}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/database"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -c "CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());"

for f in "$DIR"/migrations/*.sql; do
  name="$(basename "$f")"
  done_flag="$("${PSQL[@]}" -tA -c "SELECT 1 FROM schema_migrations WHERE filename='$name'")"
  if [ -z "$done_flag" ]; then
    echo ">> Áp dụng $name"
    "${PSQL[@]}" -f "$f"
    "${PSQL[@]}" -c "INSERT INTO schema_migrations(filename) VALUES ('$name')"
  else
    echo "-- Bỏ qua $name (đã áp dụng)"
  fi
done

echo ">> Nạp dữ liệu tham chiếu"
"${PSQL[@]}" -f "$DIR/seeds/001_reference_data.sql"
if [ "${1:-}" = "--seed-demo" ]; then
  echo ">> Nạp dữ liệu MINH HỌA"
  "${PSQL[@]}" -f "$DIR/seeds/002_demo_data.sql"
fi
echo "Hoàn tất."
