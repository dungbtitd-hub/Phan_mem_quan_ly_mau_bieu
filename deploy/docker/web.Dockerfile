# Frontend React build tĩnh + Nginx (TLS, reverse proxy tới API). Chạy không cần root.
# Build context: thư mục gốc của repo.
FROM node:22-alpine AS build
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.28-alpine AS runtime
COPY deploy/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /src/dist /usr/share/nginx/html
# Biến dùng trong template (envsubst khi container khởi động)
ENV API_UPSTREAM=api:8080 \
    PUBLIC_HTTPS_PORT=443
EXPOSE 8080 8443
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/nginx-health || exit 1
