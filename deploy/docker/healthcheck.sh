#!/bin/bash
# Health check cho container api, không cần cài curl: gọi GET /health/ready qua /dev/tcp của bash.
exec 3<>/dev/tcp/127.0.0.1/8080 || exit 1
printf 'GET /health/ready HTTP/1.0\r\nHost: localhost\r\n\r\n' >&3
head -n 1 <&3 | grep -q ' 200 '
