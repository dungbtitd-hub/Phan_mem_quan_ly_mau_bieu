-- DỮ LIỆU MINH HỌA (is_demo = true). Chỉ dùng cho kiểm thử, KHÔNG nạp vào môi trường thật.
BEGIN;
INSERT INTO applications (code, name, description, owner_unit, is_demo) VALUES
    ('DEMO-APP1', '[MINH HỌA] Hệ thống ứng dụng 1', 'Dữ liệu minh họa', 'Đơn vị minh họa', true),
    ('DEMO-APP2', '[MINH HỌA] Hệ thống ứng dụng 2', 'Dữ liệu minh họa', 'Đơn vị minh họa', true)
ON CONFLICT DO NOTHING;
COMMIT;
