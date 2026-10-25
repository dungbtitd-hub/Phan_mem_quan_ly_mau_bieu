# ADR-002: Một project backend duy nhất

- **Bối cảnh:** hệ thống nội bộ khoảng 150 người dùng, nghiệp vụ gọn (quản lý mẫu biểu, phiên bản, phân quyền).
- **Quyết định:** gộp Domain, Data, Services, Controllers vào `backend/src/Api` (một project), tách bằng thư mục và namespace. Project test riêng sẽ thêm ở Bước 6.
- **Phương án đã loại:** tách 3-4 project (Api/Domain/Data/Tests) theo Clean Architecture; tăng độ phức tạp mà chưa mang lại lợi ích ở quy mô này.
- **Hệ quả:** nếu sau này cần dùng chung Domain cho dịch vụ khác thì tách ra; quy tắc nghiệp vụ nằm ở `Services/`, không nằm trong Controllers.
- **Cập nhật cây thư mục:** thay `src/Domain`, `src/Data` đã nêu ở Bước 3 bằng các thư mục tương ứng bên trong `src/Api`.
