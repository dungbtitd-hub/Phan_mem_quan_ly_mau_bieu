#!/usr/bin/env bash
# Kiểm thử nhanh hệ thống đã cài (qua Nginx HTTPS): health, đăng nhập Admin, đổi mật khẩu,
# tạo hệ thống, tải lên mẫu biểu, tải xuống, đăng xuất. Dùng trong CI.
# Dùng: BASE=https://localhost ADMIN_USER=admin ADMIN_PASS=... NEW_PASS=... ./smoke-test.sh <tệp.docx>
set -euo pipefail
BASE="${BASE:-https://localhost}"; FILE="$1"
J="$(mktemp)"; trap 'rm -f "$J"' EXIT
C=(curl -sS -k -b "$J" -c "$J" --fail-with-body)
csrf() { "${C[@]}" "$BASE/api/auth/csrf" | sed -E 's/.*"token":"([^"]+)".*/\1/'; }
step() { printf '\n== %s\n' "$*"; }

step "Health"
"${C[@]}" "$BASE/health/ready"
step "Trang chủ (SPA)"
"${C[@]}" -o /dev/null -w '%{http_code}\n' "$BASE/forms"
step "Request ghi không có CSRF phải bị chặn"
code="$(curl -sk -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' "$BASE/api/auth/login")"
[ "$code" = "400" ] || { echo "Mong đợi 400, nhận $code"; exit 1; }
step "Đăng nhập Admin"
T="$(csrf)"
"${C[@]}" -H "X-CSRF-TOKEN: $T" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" "$BASE/api/auth/login"
step "Đổi mật khẩu lần đầu"
T="$(csrf)"
"${C[@]}" -H "X-CSRF-TOKEN: $T" -H 'Content-Type: application/json' \
  -d "{\"currentPassword\":\"$ADMIN_PASS\",\"newPassword\":\"$NEW_PASS\"}" "$BASE/api/auth/change-password"
T="$(csrf)"
"${C[@]}" -H "X-CSRF-TOKEN: $T" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$NEW_PASS\"}" "$BASE/api/auth/login"
T="$(csrf)"
step "Tạo hệ thống ứng dụng"
APP="$("${C[@]}" -H "X-CSRF-TOKEN: $T" -H 'Content-Type: application/json' \
  -d '{"code":"SMOKE","name":"Hệ thống kiểm thử"}' "$BASE/api/applications" | sed -E 's/.*"data":\{"id":"([^"]+)".*/\1/')"
echo "id=$APP"
step "Tải lên mẫu biểu"
FORM="$("${C[@]}" -H "X-CSRF-TOKEN: $T" -F code=SMOKE-01 -F "name=Mẫu kiểm thử" -F "applicationId=$APP" \
  -F "file=@$FILE;type=application/vnd.openxmlformats-officedocument.wordprocessingml.document" \
  "$BASE/api/forms" | sed -E 's/.*"data":\{"id":"([^"]+)".*/\1/')"
echo "id=$FORM"
step "Danh sách phiên bản và tải xuống bản nháp"
VER="$("${C[@]}" "$BASE/api/forms/$FORM/versions" | sed -E 's/.*"id":"([^"]+)".*/\1/')"
"${C[@]}" -o /dev/null -w 'HTTP %{http_code}, %{size_download} byte\n' "$BASE/api/versions/$VER/download"
step "Đăng xuất"
"${C[@]}" -X POST -H "X-CSRF-TOKEN: $T" "$BASE/api/auth/logout" -o /dev/null -w '%{http_code}\n'
echo; echo "KIỂM THỬ NHANH: ĐẠT"
