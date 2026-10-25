-- 001_init_schema.sql : khởi tạo schema Cổng quản lý mẫu biểu (PostgreSQL 14+)
BEGIN;

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() không IMMUTABLE nên cần hàm bọc để dùng trong index
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ===== Người dùng, vai trò, nhóm =====
CREATE TABLE users (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username              varchar(100) NOT NULL,
    full_name             varchar(200) NOT NULL,
    email                 varchar(200),
    unit_name             varchar(200),
    password_hash         text NOT NULL,
    status                varchar(20) NOT NULL DEFAULT 'active',
    failed_login_count    integer NOT NULL DEFAULT 0,
    locked_until          timestamptz,
    must_change_password  boolean NOT NULL DEFAULT true,
    password_changed_at   timestamptz,
    last_login_at         timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_users_status CHECK (status IN ('active','locked','disabled')),
    CONSTRAINT ck_users_username CHECK (username ~ '^[A-Za-z0-9._@-]{3,100}$'),
    CONSTRAINT ck_users_failed CHECK (failed_login_count >= 0)
);
CREATE UNIQUE INDEX ux_users_username ON users (lower(username));
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE roles (
    id          smallint PRIMARY KEY,
    code        varchar(30) NOT NULL UNIQUE,
    name        varchar(100) NOT NULL
);

CREATE TABLE user_roles (
    user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id   smallint NOT NULL REFERENCES roles(id),
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE user_groups (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name         varchar(150) NOT NULL,
    description  varchar(500),
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_user_groups_name ON user_groups (lower(name));

CREATE TABLE user_group_members (
    group_id  uuid NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
    user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, user_id)
);
CREATE INDEX ix_ugm_user ON user_group_members (user_id);

-- ===== Hệ thống ứng dụng =====
CREATE TABLE applications (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code          varchar(50) NOT NULL,
    name          varchar(200) NOT NULL,
    description   varchar(1000),
    owner_unit    varchar(200),
    manager_id    uuid REFERENCES users(id),
    status        varchar(20) NOT NULL DEFAULT 'active',
    is_demo       boolean NOT NULL DEFAULT false,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_applications_status CHECK (status IN ('active','locked')),
    CONSTRAINT ck_applications_code CHECK (code ~ '^[A-Za-z0-9._-]{1,50}$')
);
CREATE UNIQUE INDEX ux_applications_code ON applications (lower(code));
CREATE INDEX ix_applications_name_trgm ON applications
    USING gin (lower(immutable_unaccent(name)) gin_trgm_ops);
CREATE TRIGGER trg_applications_updated BEFORE UPDATE ON applications
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Quyền xem theo hệ thống: gán cho một user hoặc một nhóm (đúng một trong hai)
CREATE TABLE application_permissions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id  uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    user_id         uuid REFERENCES users(id) ON DELETE CASCADE,
    group_id        uuid REFERENCES user_groups(id) ON DELETE CASCADE,
    granted_by      uuid REFERENCES users(id),
    granted_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_app_perm_target CHECK (num_nonnulls(user_id, group_id) = 1)
);
CREATE UNIQUE INDEX ux_app_perm_user  ON application_permissions (application_id, user_id)  WHERE user_id  IS NOT NULL;
CREATE UNIQUE INDEX ux_app_perm_group ON application_permissions (application_id, group_id) WHERE group_id IS NOT NULL;
CREATE INDEX ix_app_perm_user  ON application_permissions (user_id)  WHERE user_id  IS NOT NULL;
CREATE INDEX ix_app_perm_group ON application_permissions (group_id) WHERE group_id IS NOT NULL;

-- ===== Mẫu biểu và phiên bản =====
CREATE TABLE form_types (
    id    smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code  varchar(30) NOT NULL UNIQUE,
    name  varchar(150) NOT NULL
);

CREATE TABLE forms (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code                varchar(50) NOT NULL,           -- Admin tự đặt, duy nhất toàn hệ thống
    name                varchar(300) NOT NULL,
    description         varchar(2000),
    application_id      uuid NOT NULL REFERENCES applications(id),
    form_type_id        smallint REFERENCES form_types(id),
    current_version_id  uuid,                           -- FK thêm sau (vòng tham chiếu)
    is_demo             boolean NOT NULL DEFAULT false,
    created_by          uuid NOT NULL REFERENCES users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_forms_code CHECK (code ~ '^[A-Za-z0-9._-]{1,50}$')
);
CREATE UNIQUE INDEX ux_forms_code ON forms (lower(code));
CREATE INDEX ix_forms_application ON forms (application_id);
CREATE INDEX ix_forms_name_trgm ON forms
    USING gin (lower(immutable_unaccent(name)) gin_trgm_ops);
CREATE TRIGGER trg_forms_updated BEFORE UPDATE ON forms
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE form_versions (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id            uuid NOT NULL REFERENCES forms(id),
    version_no         integer NOT NULL,
    original_file_name varchar(300) NOT NULL,
    stored_name        varchar(100) NOT NULL UNIQUE,    -- tên GUID trên kho tệp
    content_type       varchar(150) NOT NULL,
    size_bytes         bigint NOT NULL,
    sha256             char(64) NOT NULL,
    effective_date     date,
    expiry_date        date,
    change_note        varchar(2000),
    status             varchar(20) NOT NULL DEFAULT 'draft',
    created_by         uuid NOT NULL REFERENCES users(id),
    created_at         timestamptz NOT NULL DEFAULT now(),
    submitted_at       timestamptz,
    approved_by        uuid REFERENCES users(id),
    approved_at        timestamptz,
    revoked_at         timestamptz,
    CONSTRAINT ck_fv_status CHECK (status IN ('draft','pending','active','expired','revoked')),
    CONSTRAINT ck_fv_size CHECK (size_bytes > 0 AND size_bytes <= 31457280),   -- 30 MB
    CONSTRAINT ck_fv_version CHECK (version_no >= 1),
    CONSTRAINT ck_fv_dates CHECK (expiry_date IS NULL OR effective_date IS NULL OR expiry_date >= effective_date),
    CONSTRAINT ck_fv_sha CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_fv_no_self_approve CHECK (approved_by IS NULL OR approved_by <> created_by),
    CONSTRAINT uq_fv_form_version UNIQUE (form_id, version_no)
);
-- Mỗi mẫu biểu chỉ có tối đa MỘT phiên bản đang hiệu lực
CREATE UNIQUE INDEX ux_fv_one_active ON form_versions (form_id) WHERE status = 'active';
CREATE INDEX ix_fv_status_expiry ON form_versions (status, expiry_date);

ALTER TABLE forms
    ADD CONSTRAINT fk_forms_current_version
    FOREIGN KEY (current_version_id) REFERENCES form_versions(id)
    DEFERRABLE INITIALLY DEFERRED;

-- Không cho đổi mã mẫu biểu sau khi đã có phiên bản được phê duyệt
CREATE OR REPLACE FUNCTION forms_lock_code() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.code IS DISTINCT FROM OLD.code AND EXISTS (
        SELECT 1 FROM form_versions WHERE form_id = OLD.id AND approved_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Không thể đổi mã mẫu biểu đã có phiên bản được phê duyệt'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_forms_lock_code BEFORE UPDATE OF code ON forms
    FOR EACH ROW EXECUTE FUNCTION forms_lock_code();

-- Không cho xóa phiên bản (chỉ thu hồi) để giữ khả năng truy vết
CREATE OR REPLACE FUNCTION forbid_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Không được xóa bản ghi trong bảng %', TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END $$;
CREATE TRIGGER trg_fv_no_delete BEFORE DELETE ON form_versions
    FOR EACH ROW EXECUTE FUNCTION forbid_delete();

-- ===== Lịch sử phê duyệt =====
CREATE TABLE approval_history (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    version_id  uuid NOT NULL REFERENCES form_versions(id),
    actor_id    uuid NOT NULL REFERENCES users(id),
    action      varchar(20) NOT NULL,
    reason      varchar(1000),
    acted_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_ah_action CHECK (action IN ('submit','approve','reject','revoke','expire'))
);
CREATE INDEX ix_ah_version ON approval_history (version_id, acted_at);

-- ===== Nhật ký (chỉ ghi thêm) =====
CREATE TABLE audit_logs (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at        timestamptz NOT NULL DEFAULT now(),
    user_id            uuid REFERENCES users(id),
    username_snapshot  varchar(100),
    action             varchar(60) NOT NULL,
    object_type        varchar(60),
    object_id          varchar(100),
    result             varchar(10) NOT NULL,
    ip_address         inet,
    request_id         varchar(64),
    detail             jsonb,
    CONSTRAINT ck_audit_result CHECK (result IN ('success','failure'))
);
CREATE INDEX ix_audit_time ON audit_logs (occurred_at DESC);
CREATE INDEX ix_audit_user ON audit_logs (user_id, occurred_at DESC);
CREATE INDEX ix_audit_action ON audit_logs (action, occurred_at DESC);

CREATE OR REPLACE FUNCTION forbid_modify() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Nhật ký chỉ cho phép ghi thêm (bảng %)', TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END $$;
CREATE TRIGGER trg_audit_append_only BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION forbid_modify();

CREATE TABLE download_logs (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    version_id     uuid NOT NULL REFERENCES form_versions(id),
    user_id        uuid NOT NULL REFERENCES users(id),
    downloaded_at  timestamptz NOT NULL DEFAULT now(),
    ip_address     inet
);
CREATE INDEX ix_dl_time ON download_logs (downloaded_at DESC);
CREATE INDEX ix_dl_version ON download_logs (version_id);
CREATE INDEX ix_dl_user ON download_logs (user_id, downloaded_at DESC);

COMMIT;
