# revRoom — bản sửa đã kiểm tra

Đã sửa lệch ngày Step; nút Ngày kế của Animation; quy tắc giá dương, giữ thứ tự và giới hạn; test giao diện 3 biểu đồ và tên Monte Carlo; thêm lệnh test:ui và cấu hình Playwright; thêm chú giải biểu đồ; làm rõ nhãn doanh thu, bảo vệ và hệ số giá; CSV Monte Carlo chứa cấu hình.

Kiểm chứng: 18/18 kiểm thử mô hình qua; kiểm thử tương tác React xác nhận Step ngày và mở Animation giữ ngày 1; TypeScript và build production thành công. Playwright trên trình duyệt thực chưa chạy được do Chromium bị môi trường chặn. Cần chạy npm run test:ui trên máy nhóm sau npx playwright install chromium.

Cài Node.js 20+; mở terminal trong thư mục chứa package.json, chạy npm ci rồi npm run dev. Mở URL terminal hiển thị. Không mở trực tiếp index.html bằng nhấp đúp.

Các giả định WTP, Normal xấp xỉ, dự báo theo giá hiện tại và mức bảo vệ cố định trong ngày được giữ và nêu rõ trong README. Đây là các giới hạn mô hình, không phải lỗi lập trình đã được khắc phục. Chạy lại thực nghiệm sau thay đổi quy tắc giá; không mặc định dùng lại kết quả của ZIP cũ.
