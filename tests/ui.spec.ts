import { test, expect } from '@playwright/test';

test('revRoom: RMaaS navigation, historical forecast, 3 strategies, simulation & Monte Carlo', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173');

  await expect(page.getByText('revRoom', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Dịch vụ định giá khách sạn (RMaaS)' })).toBeVisible();

  // 1. Mở Cách 2 (Dữ liệu lịch sử) ngay tại tab Dịch vụ định giá
  await page.getByText('CÁCH 2: Gửi dữ liệu Cùng kỳ năm ngoái hoặc 3 tháng gần nhất (CSV)').click();

  // Bấm nạp dữ liệu mẫu 3 tháng (Quý 3 Cao điểm hè)
  await page.getByText('Quý 3 (Tháng 7–9)').click();
  await expect(page.getByText('TỔNG LƯỢT ĐẶT ĐÃ PHÂN TÍCH')).toBeVisible();

  // Chuyển sang tab Mô phỏng & So sánh
  await page.getByRole('button', { name: 'Mô phỏng & So sánh' }).click();
  await expect(page.getByRole('heading', { name: 'Mô phỏng bán phòng & Đối soát 3 chiến lược' })).toBeVisible();

  // 2. Kiểm tra 3 Tab chiến lược riêng biệt
  await page.getByRole('button', { name: 'Chiến lược A · FCFS' }).click();
  await expect(page.getByRole('heading', { name: 'Chiến lược A · FCFS (First-Come, First-Served)' })).toBeVisible();
  await expect(page.getByText('The Spoilage Trap')).toBeVisible();

  await page.getByRole('button', { name: 'Chiến lược B · EMSR-b' }).click();
  await expect(page.getByRole('heading', { name: 'Chiến lược B · EMSR-b (Bảo vệ hạn mức phòng)' })).toBeVisible();

  await page.getByRole('button', { name: 'Chiến lược C · Giá động' }).click();
  await expect(page.getByRole('heading', { name: 'Chiến lược C · Dynamic Pricing (Định giá động)' })).toBeVisible();

  // 3. Tab Mô phỏng & So sánh
  await page.getByRole('button', { name: 'Mô phỏng & So sánh' }).click();
  await expect(page.getByRole('heading', { name: 'Mô phỏng bán phòng & Đối soát 3 chiến lược' })).toBeVisible();

  await page.getByRole('button', { name: 'Step ngày' }).click();
  await expect(page.locator('progress')).toHaveAttribute('value', '1');
  await expect(page.getByRole('heading', { name: 'Nhật ký giao dịch chi tiết · Ngày 1', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Chạy đủ 30 ngày' }).click();
  await expect(page.locator('progress')).toHaveAttribute('value', '30');

  await expect(page.getByRole('heading', { name: 'Bảng Đối Soát Chỉ Số Vàng Quản Trị Doanh Thu' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bảng giá thay đổi theo từng ngày' })).toBeVisible();
  await expect(page.locator('.log').filter({ hasText: 'Bảng giá thay đổi theo từng ngày' }).locator('tbody tr')).toHaveCount(30);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV' }).click();
  expect((await download).suggestedFilename()).toContain('.csv');

  // 4. Tab Kiểm định Monte Carlo
  await page.getByRole('button', { name: 'Kiểm định Monte Carlo' }).click();
  await expect(page.getByRole('heading', { name: 'Kiểm định Monte Carlo · Đánh giá độ tin cậy' })).toBeVisible();
  await page.locator('.batch-hero button').click();
  await expect(page.locator('.batch-hero table').first()).toBeVisible({ timeout: 30000 });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});

test('revRoom: form định giá cung cấp số phòng, số lượng giá và tự động đồng bộ sang mô phỏng', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173');

  // 1. Tại tab Dịch vụ định giá: người dùng điền số phòng & thêm hạng phòng ở khối Thiết Lập Khách Sạn
  const capacityInput = page.getByPlaceholder('0');
  await capacityInput.fill('120');

  // Thêm hạng phòng
  await page.getByRole('button', { name: 'Thêm hạng phòng' }).click();

  // Mở Cách 1 (Phân phối lượng khách theo Poisson)
  await page.getByText('CÁCH 1: Phân phối lượng khách theo Phân phối Poisson').click();

  // Chuyển sang tab Mô phỏng & So sánh (không cần bấm nút áp dụng)
  await page.getByRole('button', { name: 'Mô phỏng & So sánh' }).click();

  // 2. Kiểm tra tab Mô phỏng đã tự động nhận cấu hình 120 phòng
  await expect(page.getByRole('heading', { name: 'Mô phỏng bán phòng & Đối soát 3 chiến lược' })).toBeVisible();
  await expect(page.locator('header.topbar')).toContainText('120 phòng');
  await expect(page.locator('progress')).toHaveAttribute('value', '0');

  // Chạy đủ 30 ngày và kiểm tra
  await page.getByRole('button', { name: 'Chạy đủ 30 ngày' }).click();
  await expect(page.locator('progress')).toHaveAttribute('value', '30');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV' }).click();
  expect((await download).suggestedFilename()).toContain('.csv');

  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.locator('progress')).toHaveAttribute('value', '0');
});
