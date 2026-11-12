# revRoom — Hotel Revenue Management Simulator

Ứng dụng React + TypeScript + Vite mô phỏng quản trị doanh thu khách sạn cho 100 phòng, 30 ngày nhận đặt phòng và ba phân khúc giá.

## Cấu trúc module

Mã nguồn được tách theo chiến lược:

- `src/model/shared/customerGenerator.ts`: sinh khách, WTP, booking curve, Poisson/Normal và seed tái lập.
- `src/model/strategy-a/fcfs.ts`: mô phỏng FCFS độc lập.
- `src/model/strategy-b/emsrB.ts`: quantile và tính protection level EMSR-b.
- `src/model/strategy-b/simulation.ts`: mô phỏng chiến lược B.
- `src/model/strategy-c/dynamicPricing.ts`: tính giá động đầu ngày.
- `src/model/strategy-c/simulation.ts`: mô phỏng chiến lược C.
- `src/model/shared/monteCarlo.ts`: chạy nhiều seed ghép cặp, thống kê và CSV chi tiết.
- `src/model/shared/statistics.ts`: mean, median, SD, min/max, CI 95%.
- `src/model/simulation.ts`: điều phối ba module, giữ API mà giao diện đang dùng.
- `src/model/metrics.ts`: KPI và CSV một lần mô phỏng.

Tài liệu thiết kế và hướng dẫn nằm trong `docs/` dưới dạng `.txt`. Xem `docs/architecture/00_GIAI_THICH_CAU_TRUC_MODULE.txt` để biết vai trò từng file.

## Mô hình

- **Khách du lịch:** giá thấp, xu hướng đặt sớm.
- **Khách tiêu chuẩn:** giá trung bình, xu hướng đặt giữa kỳ.
- **Thương nhân:** giá cao, xu hướng đặt muộn.
- **A — FCFS:** ba mức giá cố định, không bảo vệ tồn kho.
- **B — EMSR-b:** ba mức giá cố định, tính hai mức bảo vệ lồng nhau.
- **C — Dynamic Pricing + EMSR-b:** cập nhật cả ba mức giá ở đầu mỗi ngày theo booking pace; sau đó tính lại hai mức bảo vệ EMSR-b.

Cùng một tập khách, WTP và thứ tự đến được dùng cho cả A/B/C trong một seed. Mỗi chính sách có một kho 100 phòng độc lập.

## EMSR-b

Giá được sắp xếp tăng dần `p1 < p2 < p3`, nhu cầu dự báo còn lại là `mu1, mu2, mu3`.

Với mỗi lớp giá thấp `i`, gộp các lớp giá cao hơn:

`averageFare(i+1:n) = sum(pj * muj) / sum(muj)`

`criticalFractile(i) = 1 - pi / averageFare(i+1:n)`

`protection(i) = quantile(sum(muj), criticalFractile(i))`

Trong cấu hình ba lớp, mức bảo vệ 1 bảo vệ nhu cầu lớp tiêu chuẩn + thương nhân; mức bảo vệ 2 bảo vệ nhu cầu thương nhân. Booking limit của lớp thấp nhất là `capacity - protection[0]`; lớp giữa bị giới hạn bởi `capacity - protection[1]`; lớp cao nhất không có bảo vệ phía trên.

Đây là xấp xỉ EMSR-b: tổng nhu cầu các lớp cao hơn được gộp, dùng giá bình quân có trọng số theo nhu cầu. Với Poisson, tổng kỳ vọng được dùng làm tham số Poisson; với Normal, dùng xấp xỉ phương sai bằng kỳ vọng.

## Dynamic Pricing

Đầu ngày `d`, hệ số giá:

`m(d) = clamp(1 + k * (soldAtStart / capacity - (d - 1) / 30), minMultiplier, maxMultiplier)`

Ba giá chào được nhân với cùng hệ số và làm tròn đến 10.000 đồng. Giá cố định trong toàn bộ ngày; ngày tiếp theo mới cập nhật. Tab Tổng quan hiển thị lịch sử giá theo từng ngày cho cả ba phân khúc và hệ số giá.

Đây là heuristic dựa trên booking pace, không phải nghiệm tối ưu toàn cục.

## Cài đặt và chạy

Yêu cầu Node.js 20+ khuyến nghị.

```bash
npm install
npm run dev
```

Mở URL Vite in ra trên terminal.

## Kiểm thử và build

```bash
npm test
npm run build
npm run preview
```

## Tính năng giao diện

- Tổng quan KPI, doanh thu, ADR, RevPAR, Occupancy.
- Thống kê từng ngày theo ba phân khúc và chính sách.
- Bảng lịch sử ba mức giá của từng ngày, gồm hệ số Dynamic Pricing.
- Nhật ký từng khách: phân khúc, WTP, giá chào, quyết định, tồn kho và ngưỡng bảo vệ.
- Animation phát lại cùng một khách qua A/B/C: Play, Pause, Step, Speed, Reset.
- Room allocation với 100 ô tồn kho cho mỗi chiến lược.
- Đánh giá Monte Carlo 100–5.000 seed ghép cặp; mean, median, SD, min/max, CI 95%, win rate, paired difference và xuất CSV từng seed.

## Kiểm thử theo module

- `tests/strategy-a/fcfs.test.ts`: kiểm thử riêng FCFS.
- `tests/strategy-b/emsr-b.test.ts`: kiểm thử riêng EMSR-b và chiến lược B.
- `tests/strategy-c/dynamic-pricing.test.ts`: kiểm thử riêng giá động và chiến lược C.
- `tests/model.test.ts`: kiểm thử tích hợp toàn mô hình.

## Phạm vi và giới hạn

Một đêm lưu trú; không mô hình hóa hủy phòng, no-show, overbooking, nhiều hạng phòng, thời gian lưu trú nhiều đêm, chi phí, đối thủ hoặc ràng buộc giá theo từng phân khúc. WTP được lấy mẫu Uniform từ 0,7 đến 1,6 lần giá tham chiếu. Normal là xấp xỉ Gaussian cho số khách, làm tròn và cắt tại 0.

## Seed và khả năng tái lập

- Ô **Seed** trong Cấu hình mô phỏng nhận số nguyên từ `0` đến `4294967095`.
- **Tạo seed ngẫu nhiên** chỉ thay đổi cấu hình nháp; seed mới chỉ có hiệu lực sau khi nhấn **Áp dụng & tạo lại mô phỏng**.
- Khi cùng seed và cùng cấu hình, `generateCustomers()` tạo lại cùng danh sách khách, WTP và thứ tự đến. A/B/C luôn dùng chung danh sách này.
- **Reset** đặt tiến trình mô phỏng về ngày 0 nhưng giữ nguyên seed và dữ liệu khách, do đó chạy lại cùng kịch bản.
- **Monte Carlo** dùng dãy seed liên tiếp theo số lượt chọn (100–5.000); trong mỗi lượt, ba chiến lược được so sánh trên cùng một kịch bản. Seed được wrap theo miền seed hợp lệ để không vượt giới hạn PRNG.
- Seed được ghi trong tên file CSV và cấu hình được lưu cùng dữ liệu CSV để hỗ trợ tái lập kết quả.


## Customer Data Generator (TypeScript)

Module sinh khách hàng được đặt tại `src/model/customerGenerator.ts`.
Nó sử dụng `Config` và `Customer` hiện có trong `src/model/types.ts`,
hỗ trợ Poisson/Normal, ba booking curve, WTP Uniform và Seed tái lập.

API:
```ts
import { CustomerGenerator, generateCustomers } from './model/customerGenerator';

const schedule = generateCustomers(config);
// Hoặc:
const generator = new CustomerGenerator(config);
const schedule2 = generator.generate();
const dailyStats = generator.dailySummary();
```

`src/model/demand.ts` giữ vai trò lớp tương thích: re-export các hàm sinh
khách từ `customerGenerator.ts` và cung cấp `remainingForecast()` cho EMSR-b.
Do đó các module mô phỏng hiện tại tiếp tục import từ `demand.ts` mà không
cần thay đổi đường dẫn. A/B/C phải dùng chung một `CustomerSchedule`.


## Bản sửa và giới hạn cần hiểu
- Sửa Step ngày đồng bộ ngày vừa tính với nhật ký. Animation có nút Ngày kế để xem/tính đúng ngày tiếp theo.
- Giá động ưu tiên dương, giới hạn min/max và thứ tự ba lớp giá. Làm tròn 10.000đ khi khả thi; nếu làm tròn làm trùng lớp giá, dùng giá nhân hệ số chính xác. Hệ số hiển thị là trước làm tròn.
- CSV Monte Carlo có cấu hình để tái lập. Cập nhật test 3 biểu đồ và nút Monte Carlo.
- Poisson là mô hình chính. Normal làm tròn/cắt 0 có kỳ vọng và phương sai thực tế khác tham số danh nghĩa, nhất là nhu cầu nhỏ.
- Thay giá cơ sở đồng thời thay WTP; đây là thay thị trường, không phải thử giá trên cùng một thị trường cố định.
- C là heuristic tiến độ bán, có thể kém B. Dự báo C giả định giá hiện tại cho nhu cầu còn lại, tính lại mỗi ngày. Mức bảo vệ cố định trong ngày có thể để phòng trống cuối kỳ.
- Chạy: npm ci, npm run dev. Kiểm tra: npm test, npm run build.
- Kiểm thử trình duyệt: npx playwright install chromium, rồi npm run test:ui (tự mở Vite).
