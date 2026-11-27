// Docker 單一映像檔實測：登入 → 新增任務 → 上傳 CSV → 屬性分類 → 隱私設定 → 執行並下載
// 執行方式見 docker/playwright.docker.config.ts；需要 E2E_BASE_URL、E2E_USERNAME、E2E_PASSWORD。
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test('Docker 版：登入、上傳、K-匿名化並下載結果', async ({ page }) => {
  test.setTimeout(180_000);
  const username = process.env.E2E_USERNAME ?? '';
  const password = process.env.E2E_PASSWORD ?? '';
  test.skip(!username || !password, '未設定 E2E_USERNAME／E2E_PASSWORD');
  const shot = (name: string) => page.screenshot({ path: `test-results-docker/${name}.png`, fullPage: true });

  await page.goto('/login');
  await page.getByLabel(/帳號|Account/).fill(username);
  await page.getByLabel(/密碼|Password/).fill(password);
  await page.getByRole('button', { name: /登入系統|Log In/i }).click();
  await page.waitForURL('**/', { timeout: 15_000 });
  await expect(page.getByText('系統運作正常')).toBeVisible();
  await shot('01-dashboard');

  await page.getByRole('button', { name: /新增去識別化任務/ }).click();
  await page.locator('input[type="file"]').setInputFiles(path.resolve(process.env.E2E_CSV ?? 'e2e/fixtures/mock_privacy_data.csv'));
  await expect(page.getByText(/解析成功|筆資料/).first()).toBeVisible({ timeout: 60_000 });
  await shot('02-uploaded');

  await page.getByRole('button', { name: /下一步：屬性分類/ }).click();
  const applyBtn = page.getByRole('button', { name: /套用系統推薦設定/ });
  if (await applyBtn.isVisible()) await applyBtn.click();
  await page.waitForTimeout(800);
  await shot('03-mapping');
  await page.getByRole('button', { name: /下一步/ }).last().click();
  await page.waitForTimeout(800);
  await shot('04-privacy-settings');

  await page.getByRole('button', { name: /下一步/ }).last().click();
  const downloadBtn = page.getByRole('button', { name: /下載處理後資料/ });
  await expect(downloadBtn).toBeEnabled({ timeout: 180_000 });
  await shot('05-result');
  // 專家回饋 P-19：結果 CSV 與注意事項 txt 各自一次點擊（不再同一次點擊連續下載，避免被瀏覽器攔截）
  const downloads: import('@playwright/test').Download[] = [];
  page.on('download', (d) => downloads.push(d));
  await downloadBtn.click();
  await page.getByTestId('usage-notes-download-file').click();
  await expect.poll(() => downloads.length, { timeout: 60_000 }).toBe(1);
  await page.getByRole('button', { name: /我已了解/ }).click();
  await expect.poll(() => downloads.length, { timeout: 60_000 }).toBe(2);
  await page.waitForTimeout(2000);
  for (const d of downloads) {
    const target = path.resolve('test-results-docker', 'dl-' + d.suggestedFilename());
    await d.saveAs(target);
    console.log('downloaded:', d.suggestedFilename(), fs.statSync(target).size, 'bytes');
  }
  const csv = downloads.find((d) => /\.csv$/i.test(d.suggestedFilename()));
  expect(csv, '應下載到處理後的 CSV').toBeTruthy();

  // 檢測報告：專家回饋 P-13 起改為瀏覽器列印（另存為 PDF 才有文字層）。Playwright 無法操作列印視窗，
  // 這裡攔住列印頁框裡的 print()，取回送去列印的 HTML，再用 Chromium 轉成 PDF，確認 PDF 內是文字而不是圖片。
  await page.getByRole('button', { name: /查看與下載報告/ }).click();
  await page.waitForTimeout(1500);
  await shot('07-report-dialog');

  const consoleErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  const printedHtml = await page.evaluate(async () => {
    const originalAppendChild = document.body.appendChild.bind(document.body);
    let captured: string | null = null;
    document.body.appendChild = ((node: Node) => {
      const appended = originalAppendChild(node);
      if (node instanceof HTMLIFrameElement && node.contentWindow) {
        node.contentWindow.print = () => { captured = node.contentDocument!.documentElement.outerHTML; };
      }
      return appended;
    }) as typeof document.body.appendChild;
    (Array.from(document.querySelectorAll('button')).find((b) => b.innerText.includes('列印／另存 PDF')) as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return captured as string | null;
  });
  await shot('08-after-pdf');
  console.log('console errors:', JSON.stringify(consoleErrors));
  expect(printedHtml, '應呼叫列印並送出報告').toBeTruthy();
  expect(printedHtml!).toContain('隱私');
  const printPage = await page.context().newPage();
  await printPage.setContent(printedHtml!);
  const pdfPath = path.resolve('test-results-docker', 'dl-report.pdf');
  await printPage.pdf({ path: pdfPath, format: 'A4', preferCSSPageSize: true, printBackground: true });
  const pdfBytes = fs.readFileSync(pdfPath);
  console.log('pdf:', pdfBytes.length, 'bytes');
  expect(pdfBytes.subarray(0, 4).toString()).toBe('%PDF');
  // 文字層：PDF 內有字型物件、沒有圖片物件
  const pdfText = pdfBytes.toString('latin1');
  expect(pdfText).toMatch(/\/Type\s*\/Font\b/);
  expect(pdfText).not.toMatch(/\/Subtype\s*\/Image/);
});
