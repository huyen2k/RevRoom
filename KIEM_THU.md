# Kiểm thử revRoom — Seed điều khiển từ giao diện

## Kiểm thử tự động

```bash
npm install
npm test
npm run build
```

Playwright UI (nếu đã cài browser):

```bash
npx playwright test
```

## Checklist seed

1. Mở Cấu hình mô phỏng; seed mặc định là `42`.
2. Nhập `2026`, nhấn **Áp dụng & tạo lại mô phỏng**.
3. Xác nhận nhãn Seed trên trang đổi thành `2026`, tiến trình về ngày 0.
4. Chạy 30 ngày và xuất CSV; tên file chứa `seed-2026`.
5. Nhấn Reset; tiến trình về ngày 0 nhưng seed vẫn là `2026`.
6. Nhấn **Tạo seed ngẫu nhiên**; giá trị mới nằm trong khoảng `0..4294967095`. Seed chỉ có hiệu lực sau khi áp dụng.
7. Chạy lại cùng seed và cấu hình; danh sách khách, WTP và thứ tự đến phải giống nhau.
8. Đổi seed; danh sách khách phải thay đổi. Trong mỗi kịch bản, A/B/C vẫn dùng cùng danh sách khách.

## Các kiểm thử mô hình

- Poisson và Normal.
- Cùng seed tái lập, seed khác sinh kịch bản khác.
- Kiểm tra biên seed, sức chứa, doanh thu, số lượng giao dịch và hai ngưỡng EMSR-b.
- Monte Carlo 100 lượt ghép cặp.
