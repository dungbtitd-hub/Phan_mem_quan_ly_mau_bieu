#!/usr/bin/env bash
# Dùng biến PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE (không cần mã hóa ký tự đặc biệt trong mật khẩu).
set -euo pipefail
export DATABASE_URL="${DATABASE_URL:-postgresql://}"
for i in $(seq 1 60); do
  pg_isready -q && break
  echo "Chờ database sẵn sàng ($i/60)..."; sleep 2
done
exec /app/scripts/migrate.sh "$@"
