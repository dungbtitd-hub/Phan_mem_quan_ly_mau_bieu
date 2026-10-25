-- 002: cho phép hành động do hệ thống thực hiện (ví dụ tự động hết hiệu lực) không có người thao tác
BEGIN;
ALTER TABLE approval_history ALTER COLUMN actor_id DROP NOT NULL;
COMMIT;
