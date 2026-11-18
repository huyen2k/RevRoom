REVROOM RMaaS - DANH MỤC TÀI LIỆU HỆ THỐNG ĐỊNH GIÁ & QUẢN TRỊ DOANH THU KHÁCH SẠN
====================================================================================

1. TÀI LIỆU KIẾN TRÚC, CÔNG THỨC DỰ BÁO & VẬN HÀNH (docs/architecture/)
-----------------------------------------------------------------------
- architecture/00_GIAI_THICH_CAU_TRUC_MODULE.txt
  Kiến trúc tổng thể nền tảng RevRoom RMaaS, sơ đồ module, dịch vụ dự báo nhu cầu (Poisson theo thời điểm trong năm & CSV lịch sử), thuật toán EMSR-b mở rộng N hạng phòng và luồng dữ liệu đồng bộ.

- architecture/04_HUONG_DAN_CHAY_KIEM_THU.txt
  Hướng dẫn cài đặt, khởi chạy ứng dụng web, sử dụng 2 phương pháp dự đoán lượng khách, chạy mô phỏng 30 ngày, kiểm định Monte Carlo đa kịch bản và chạy bộ unit test / build sản phẩm.

- architecture/05_BAO_CAO_SO_SANH_BA_CHIEN_LUOC.txt
  Khung báo cáo đối soát hiệu quả 3 chiến lược (A: FCFS, B: EMSR-b, C: Dynamic Pricing + EMSR-b) trên các chỉ số RevPAR, ADR, Công suất phòng, Thất thoát do bán rẻ sớm (Displacement Loss) và kiểm định Monte Carlo.

- architecture/06_CO_SO_TOAN_HOC_VA_HE_SO_DU_BAO.txt
  Giải thích chi tiết cơ sở toán học, kiến thức thống kê, công thức dự đoán và cách xác định các hệ số phân phối lượng khách từng ngày (Cách 1: NHPP Poisson + Hệ số mùa vụ; Cách 2: Phân rã Lead-time + OLS + Mùa vụ thứ trong tuần từ CSV lịch sử; Công thức hệ số giá động hợp lý).

2. TÀI LIỆU CHI TIẾT 3 CHIẾN LƯỢC QUẢN TRỊ DOANH THU (docs/strategy-*)
----------------------------------------------------------------------
- strategy-a/01_MO_HINH_NHU_CAU_VA_FCFS.txt
  Giải thích đầy đủ công thức dự đoán nhu cầu, cách xác định các hệ số phân phối khách (Cách 1 & Cách 2), đường cong đặt phòng theo Lead-time, mức sẵn sàng chi trả (WTP) và nguyên lý Chiến lược A (FCFS).

- strategy-b/02_EMSR_B_VA_KET_QUA_THU_NGHIEM.txt
  Thuật toán bảo vệ hạn mức tồn kho EMSR-b (Expected Marginal Seat Revenue - variant b) mở rộng cho N hạng phòng tùy chỉnh, cách tính ngưỡng bảo vệ lồng nhau (Protection Levels) và hạn mức mở bán (Booking Limits).

- strategy-c/03_DYNAMIC_PRICING_VA_THONG_KE.txt
  Chiến lược C kết hợp Định giá động theo nhịp độ đặt phòng (Booking Pace Dynamic Pricing) và tái tính toán EMSR-b hàng ngày, cùng phương pháp kiểm định Monte Carlo đa kịch bản (Thấp điểm P10, Cơ sở P50, Cao điểm P90).

3. BỘ DỮ LIỆU LỊCH SỬ ĐẶT PHÒNG MẪU 3 THÁNG THEO MÙA VỤ (docs/*.csv)
--------------------------------------------------------------------
- sample_hotel_Q1_thang1_3_mua_thap_diem.csv     : Dữ liệu 3 tháng Quý 1 (Tháng 1–3, Mùa thấp điểm sau Tết).
- sample_hotel_Q2_thang4_6_mua_chuyen_tiep.csv   : Dữ liệu 3 tháng Quý 2 (Tháng 4–6, Mùa chuyển tiếp & đầu hè).
- sample_hotel_Q3_thang7_9_mua_cao_diem_he.csv   : Dữ liệu 3 tháng Quý 3 (Tháng 7–9, Mùa cao điểm du lịch hè).
- sample_hotel_Q4_thang10_12_mua_le_hoi.csv      : Dữ liệu 3 tháng Quý 4 (Tháng 10–12, Mùa lễ hội & hội nghị MICE).
- sample_hotel_booking_history_90d.csv           : Bộ dữ liệu lịch sử đặt phòng chuẩn 90 ngày dùng để kiểm thử.
