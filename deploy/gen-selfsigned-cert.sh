#!/usr/bin/env bash
# Tạo chứng chỉ TLS tự ký (dùng tạm / thử nghiệm). Dùng: ./gen-selfsigned-cert.sh [tên_miền_hoặc_IP ...]
# Môi trường thật: chép chứng chỉ của đơn vị vào certs/server.crt (kèm chuỗi CA trung gian) và certs/server.key.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p certs
NAMES=("$@"); [ ${#NAMES[@]} -eq 0 ] && NAMES=("$(hostname -f 2>/dev/null || hostname)" localhost)
SAN=""
for n in "${NAMES[@]}"; do
  if [[ "$n" =~ ^[0-9.]+$ ]]; then SAN+="IP:$n,"; else SAN+="DNS:$n,"; fi
done
for ip in $(hostname -I 2>/dev/null || true); do [[ "$ip" =~ ^[0-9.]+$ ]] && SAN+="IP:$ip,"; done
SAN="${SAN}IP:127.0.0.1"
ARGS=(req -x509 -newkey rsa:2048 -nodes -days 825 -subj "/CN=${NAMES[0]}" -addext "subjectAltName=${SAN}")
command -v openssl >/dev/null || { echo "Máy chủ chưa có openssl. Cài openssl (apt/dnf install openssl) hoặc tự đặt certs/server.crt và certs/server.key."; exit 1; }
openssl "${ARGS[@]}" -keyout certs/server.key -out certs/server.crt
chmod 644 certs/server.crt; chmod 640 certs/server.key
# Nginx trong container chạy bằng UID 101: cần đọc được khóa
chown 101 certs/server.key 2>/dev/null || chmod 644 certs/server.key
echo "Đã tạo certs/server.crt và certs/server.key (SAN: ${SAN})"
