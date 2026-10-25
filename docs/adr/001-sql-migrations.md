# ADR-001: Migration bằng SQL thuần, EF Core chỉ để ánh xạ

- **Bối cảnh:** schema dùng partial unique index, trigger, extension (unaccent, pg_trgm), CHECK; các phần này khó và dễ lệch khi sinh từ EF Core migration.
- **Quyết định:** `database/migrations/*.sql` là nguồn sự thật duy nhất, áp dụng bằng `scripts/migrate.sh`. EF Core chỉ ánh xạ model vào schema có sẵn, không dùng `dotnet ef migrations`.
- **Phương án đã loại:** EF Core migrations (không biểu diễn gọn trigger/index đặc thù).
- **Hệ quả:** khi đổi schema phải thêm file migration mới, cập nhật model EF, API, test và tài liệu cùng lúc.
