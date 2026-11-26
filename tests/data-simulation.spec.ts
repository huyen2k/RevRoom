import { test, expect } from '@playwright/test';

test('Giả lập dữ liệu edits individual days and applies each source independently', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-12-01T12:00:00'));
  await page.goto('/');
  const open = async (name: string) => {
    await page.getByRole('button', { name: 'Danh mục', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
  };
  await open('Giả lập dữ liệu');
  const history = page.getByRole('region', { name: '30 ngày trước', exact: true });
  const calendar = page.getByRole('region', { name: '30 ngày tiếp theo', exact: true });
  const sources = page.getByRole('region', { name: 'Nguồn dữ liệu khách' });
  const useHistory = sources.getByRole('checkbox', { name: /Dùng dữ liệu 30 ngày trước/ });
  const useCalendar = sources.getByRole('checkbox', { name: /Dùng lịch 30 ngày tiếp theo/ });
  const apply = sources.getByRole('button', { name: 'Sinh dữ liệu và áp dụng' });
  const generate = history.getByRole('button', { name: 'Sinh dữ liệu 30 ngày trước' });
  const dialog = page.getByRole('dialog');

  async function expectSource(label: string) {
    await apply.click();
    await expect(page.locator('.demand-source strong')).toHaveText(label);
    await expect(page.locator('progress')).toHaveAttribute('value', '0');
    await open('Giả lập dữ liệu');
  }

  await expect(history.locator('.data-calendar button')).toHaveCount(30);
  await expect(calendar.locator('.data-calendar button')).toHaveCount(30);
  await expect(page.locator('input[type=date]')).toHaveCount(0);
  await expect(dialog).toHaveCount(0);
  await expectSource('Mặc định');
  await useHistory.check();
  await expect(apply).toBeDisabled();

  await history.getByRole('button', { name: /^Ngày 1 / }).click();
  await dialog.getByLabel('Loại ngày').selectOption('Ngày lễ');
  await expect(dialog.getByLabel('Khách du lịch')).toHaveValue('1.3');
  await dialog.getByLabel('Tên dịp (tùy chọn)').fill('Kỳ nghỉ');
  await dialog.getByRole('button', { name: 'Lưu ngày' }).click();
  await expect(history.getByRole('button', { name: /^Ngày 1 Ngày lễ Kỳ nghỉ$/ })).toBeVisible();
  await generate.click();
  await expect(history.getByRole('status')).toContainText('lượt hỏi cho 30 ngày trước');
  const download = page.waitForEvent('download');
  await history.getByRole('button', { name: 'Tải CSV lịch sử' }).click();
  expect((await download).suggestedFilename()).toBe('revRoom-30-ngay-truoc-seed-2026.csv');
  await expectSource('Dữ liệu 30 ngày trước');

  await history.getByRole('button', { name: /^Ngày 1 Ngày lễ/ }).click();
  await dialog.getByRole('button', { name: 'Khôi phục theo lịch' }).click();
  await expect(history.getByRole('button', { name: 'Ngày 1 Cuối tuần', exact: true })).toBeVisible();
  await expect(apply).toBeDisabled();
  await generate.click();
  await useHistory.uncheck();

  const upcomingDay = calendar.getByRole('button', { name: /^Ngày 5 / });
  await expect(upcomingDay).toHaveText('Ngày 5Cuối tuần');
  await upcomingDay.click();
  await dialog.getByLabel('Loại ngày').selectOption('Sự kiện');
  await dialog.getByLabel('Tên dịp (tùy chọn)').fill('Hội nghị');
  await dialog.getByLabel('Thương nhân').fill('1.5');
  await dialog.getByRole('button', { name: 'Lưu ngày' }).click();
  await expect(upcomingDay).toHaveText('Ngày 5Sự kiệnHội nghị');
  await upcomingDay.click();
  await expect(dialog.getByLabel('Thương nhân')).toHaveValue('1.5');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await useCalendar.check();
  await expectSource('Lịch 30 ngày tiếp theo');
  await useHistory.check();
  await sources.getByText('Xem nhu cầu kỳ vọng theo ngày').click();
  await expect(sources.getByRole('row', { name: /Ngày 5 · Hội nghị/ })).toBeVisible();
  await expectSource('Lịch sử + lịch sắp tới');

  await open('Tổng quan');
  await page.getByRole('button', { name: 'Chạy đủ 30 ngày' }).click();
  await expect(page.locator('progress')).toHaveAttribute('value', '30');
  await open('Monte Carlo');
  await page.locator('.batch-hero button').click();
  await expect(page.locator('.batch-hero table').first()).toBeVisible();
  await open('So sánh chính sách');
  await page.getByRole('button', { name: 'So sánh 3 mức nhu cầu' }).click();
  await expect(page.getByText('Đã tính 3/3 mức')).toBeVisible();

  await open('Giả lập dữ liệu');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await upcomingDay.click();
  await expect(dialog.getByRole('button', { name: 'Lưu ngày' })).toBeVisible();
  await page.keyboard.press('Escape');

  await calendar.getByRole('button', { name: 'Đặt sự kiện theo khoảng ngày' }).click();
  await dialog.getByLabel('Từ ngày').selectOption({ label: 'Ngày 4' });
  await expect(dialog.getByLabel('Đến ngày').locator('option').first()).toHaveText('Ngày 4');
  await dialog.getByLabel('Đến ngày').selectOption({ label: 'Ngày 6' });
  await dialog.getByLabel('Loại ngày').selectOption('Ngày lễ');
  await dialog.getByLabel('Tên dịp (tùy chọn)').fill('Kỳ nghỉ');
  await dialog.getByLabel('Khách du lịch').fill('1.6');
  await dialog.getByRole('button', { name: 'Áp dụng cho khoảng ngày' }).click();
  for (const day of [4, 5, 6]) {
    await expect(calendar.getByRole('button', { name: `Ngày ${day} Ngày lễ Kỳ nghỉ`, exact: true })).toBeVisible();
  }
  await expect(calendar.getByRole('button', { name: 'Ngày 3 Ngày thường', exact: true })).toBeVisible();
  await expect(history.getByRole('button', { name: 'Ngày 5 Ngày lễ Kỳ nghỉ', exact: true })).toHaveCount(0);
  await upcomingDay.click();
  await expect(dialog.getByLabel('Khách du lịch')).toHaveValue('1.6');
  await dialog.getByLabel('Khách du lịch').fill('1.7');
  await dialog.getByRole('button', { name: 'Lưu ngày' }).click();
  await calendar.getByRole('button', { name: 'Ngày 6 Ngày lễ Kỳ nghỉ', exact: true }).click();
  await expect(dialog.getByLabel('Khách du lịch')).toHaveValue('1.6');
  await page.keyboard.press('Escape');

  await history.getByRole('button', { name: 'Đặt sự kiện theo khoảng ngày' }).click();
  await dialog.getByLabel('Từ ngày').selectOption({ label: 'Ngày 29' });
  await dialog.getByLabel('Đến ngày').selectOption({ label: 'Ngày 30' });
  await dialog.getByLabel('Tên dịp (tùy chọn)').fill('Hội nghị cuối kỳ');
  await dialog.getByRole('button', { name: 'Áp dụng cho khoảng ngày' }).click();
  await expect(history.getByRole('button', { name: 'Ngày 29 Sự kiện Hội nghị cuối kỳ', exact: true })).toBeVisible();
  await expect(history.getByRole('button', { name: 'Ngày 30 Sự kiện Hội nghị cuối kỳ', exact: true })).toBeVisible();
  await expect(apply).toBeDisabled();
  await generate.click();
  await expect(apply).toBeEnabled();
});
