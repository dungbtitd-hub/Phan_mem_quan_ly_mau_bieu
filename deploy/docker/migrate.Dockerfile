# Công cụ áp dụng migration SQL + dữ liệu tham chiếu. Chạy một lần mỗi khi khởi động/cập nhật.
# Build context: thư mục gốc của repo.
FROM postgres:16-alpine
RUN apk add --no-cache bash openssl
WORKDIR /app
COPY database/ /app/database/
COPY scripts/migrate.sh /app/scripts/migrate.sh
COPY deploy/docker/migrate-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/scripts/migrate.sh /app/entrypoint.sh
USER postgres
ENTRYPOINT ["/app/entrypoint.sh"]
