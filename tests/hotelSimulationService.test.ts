import test from 'node:test';
import assert from 'node:assert/strict';
import {
  type HotelConfig,
  generateHotelCustomers,
  initialHotelState,
  stepHotelSimulation,
  runHotelSimulationFull,
  evaluateHotelMonteCarlo,
  exportHotelSimulationCsv
} from '../src/services/hotelSimulationService';

test('HotelSimulationService: Hỗ trợ linh hoạt capacity và N hạng phòng', () => {
  const customConfig: HotelConfig = {
    hotelName: 'Resort Biển Đà Nẵng 5 Sao',
    capacity: 75,
    fareClasses: [
      { id: 'promo', name: 'Siêu Ưu Đãi', price: 500000, meanDemand: 60 },
      { id: 'std', name: 'Tiêu Chuẩn', price: 900000, meanDemand: 50 },
      { id: 'dlx', name: 'Hạng Sang Deluxe', price: 1500000, meanDemand: 30 },
      { id: 'suite', name: 'Tổng Thống VIP', price: 3000000, meanDemand: 15 }
    ],
    seed: 12345,
    intensity: 1,
    distribution: 'poisson',
    k: 0.7,
    min: 0.75,
    max: 1.35
  };

  // 1. Sinh tập khách hàng 30 ngày
  const schedule = generateHotelCustomers(customConfig);
  assert.equal(schedule.length, 30);
  const totalCustomers = schedule.reduce((sum, day) => sum + day.length, 0);
  assert.ok(totalCustomers > 50, 'Tổng số khách sinh ra phải dương');

  // Khách hàng có đầy đủ thông tin phân khúc và WTP
  schedule[0].forEach(cust => {
    assert.ok(cust.wtp > 0);
    assert.ok(['promo', 'std', 'dlx', 'suite'].includes(cust.classId));
  });

  // 2. Chạy mô phỏng toàn bộ 30 ngày cho cả 3 chiến lược
  const state = runHotelSimulationFull(customConfig, schedule);
  assert.equal(state.day, 30);
  assert.equal(state.histories.A.length, 30);
  assert.equal(state.histories.B.length, 30);
  assert.equal(state.histories.C.length, 30);

  // Kiểm tra sức chứa không bao giờ bị vượt quá (75 phòng)
  for (const p of ['A', 'B', 'C'] as const) {
    const day30 = state.histories[p][29];
    assert.ok(day30.cumulativeSold <= customConfig.capacity, `${p} không được bán vượt quá ${customConfig.capacity} phòng`);
    assert.equal(day30.remainingRooms, customConfig.capacity - day30.cumulativeSold);
    assert.ok(day30.cumulativeRevenue > 0, `${p} phải tạo ra doanh thu dương`);
  }

  // 3. Kiểm tra tính chất bảo vệ phòng của EMSR-b (B)
  const day10B = state.histories.B[9];
  assert.ok(day10B.protectionByClass['promo'] >= day10B.protectionByClass['std']);

  // 4. Kiểm tra giá động của C
  const day1C = state.histories.C[0];
  const day20C = state.histories.C[19];
  assert.ok(day1C.priceMultiplier >= customConfig.min && day1C.priceMultiplier <= customConfig.max);
  assert.ok(day20C.priceMultiplier >= customConfig.min && day20C.priceMultiplier <= customConfig.max);

  // 5. Kiểm tra xuất CSV
  const csvText = exportHotelSimulationCsv(customConfig, state);
  assert.ok(csvText.includes('price_promo'));
  assert.ok(csvText.includes('price_suite'));
  assert.ok(csvText.includes('cumulative_revenue'));

  // 6. Kiểm định Monte Carlo ghép cặp 5 kịch bản
  const batch = evaluateHotelMonteCarlo(customConfig, 5);
  assert.equal(batch.n, 5);
  assert.equal(batch.rows.length, 3);
  assert.equal(batch.pairs.length, 3);
});

test('HotelSimulationService: An toàn bộ nhớ và tốc độ cao khi số phòng hoặc lượng khách cực lớn', () => {
  const hugeConfig: HotelConfig = {
    hotelName: 'Mega Resort Test',
    capacity: 100000,
    fareClasses: [
      { id: 'c1', name: 'Standard', price: 600000, meanDemand: 500000 },
      { id: 'c2', name: 'Deluxe', price: 1200000, meanDemand: 300000 },
      { id: 'c3', name: 'Suite', price: 2500000, meanDemand: 100000 }
    ],
    seed: 99,
    intensity: 1,
    distribution: 'poisson',
    k: 0.6,
    min: 0.8,
    max: 1.3
  };

  const t0 = Date.now();
  const customers = generateHotelCustomers(hugeConfig);
  const state = runHotelSimulationFull(hugeConfig, customers);
  const elapsed = Date.now() - t0;

  assert.equal(state.day, 30);
  assert.ok(elapsed < 1000, `Mô phỏng lượng khách lớn phải hoàn tất dưới 1 giây (thực tế: ${elapsed}ms)`);
  assert.ok(state.histories.C[29].cumulativeRevenue > 0);
  assert.ok(state.histories.C[29].transactions.length <= 300);
});
