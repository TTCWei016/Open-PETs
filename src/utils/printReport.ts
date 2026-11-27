/**
 * ============================================================================
 * 檔案名稱 (File): printReport.ts
 * 模組功能 (Description): 把報告畫面交給瀏覽器的「列印」功能，讓使用者選「另存為 PDF」。
 * ============================================================================
 * ★ 專家回饋 P-13：原本用 html2pdf.js 把畫面轉成圖片再貼進 PDF，PDF 裡沒有文字（不能選取、不能搜尋、讀螢幕軟體也讀不到）。
 *   改用瀏覽器列印：「另存為 PDF」會保留真正的文字（含中文），不需要另外打包字型或 PDF 套件，離線也能用。
 *
 * 做法：把報告元素複製進一個看不見的 iframe（只有報告、白底、A4 邊界），在 iframe 裡呼叫 print()，
 *   這樣不必隱藏整個應用程式畫面，也不受 antd 對話框外框影響。報告本身全部使用行內樣式，不需要複製站台樣式表。
 */

/** 列印用樣式：A4、白底、深色標題列要印出背景色、取消會截斷內容的 overflow，表格列與區塊不要被切開 */
export const PRINT_REPORT_STYLE_TEXT = `
@page { size: A4; margin: 10mm; }
html, body { margin: 0; padding: 0; background: #ffffff; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
[data-testid="compliance-report-document"] { overflow: visible !important; border-radius: 0 !important; }
tr, .pdf-page-break { break-inside: avoid; page-break-inside: avoid; }
`;

/** 檔名不能有的字元換成底線（瀏覽器會拿頁面標題當作「另存為 PDF」的建議檔名） */
export const toSafeDocumentTitle = (rawTitle: string): string => rawTitle.replace(/[\\/:*?"<>|\s]+/g, '_');

/** 列印視窗一直開著時最久保留 iframe 的時間；正常情況在 afterprint 就清掉 */
const PRINT_IFRAME_FALLBACK_CLEANUP_MS = 10 * 60 * 1000;

/**
 * 複製 sourceElement 到隱藏 iframe 並開啟列印視窗。
 * 回傳時元素已複製完成（呼叫端可以立刻還原畫面狀態，例如結束「匯出模式」）；iframe 在列印結束後自動移除。
 */
export const printReportElement = (sourceElement: HTMLElement, documentTitle: string): void =>
{
    const safeTitle = toSafeDocumentTitle(documentTitle);
    const printFrame = document.createElement('iframe');
    printFrame.setAttribute('aria-hidden', 'true');
    printFrame.setAttribute('data-testid', 'print-report-frame');
    printFrame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(printFrame);

    const frameDocument = printFrame.contentDocument;
    const frameWindow = printFrame.contentWindow;
    if (!frameDocument || !frameWindow)
    {
        printFrame.remove();
        throw new Error('無法建立列印用的頁框');
    }

    frameDocument.open();
    frameDocument.write(`<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><title>${safeTitle}</title></head><body></body></html>`);
    frameDocument.close();
    const printStyleElement = frameDocument.createElement('style');
    printStyleElement.textContent = PRINT_REPORT_STYLE_TEXT;
    frameDocument.head.appendChild(printStyleElement);
    frameDocument.body.appendChild(frameDocument.importNode(sourceElement, true));

    // 部分瀏覽器以最上層頁面的標題當建議檔名：列印期間暫時改標題，結束後還原
    const originalPageTitle = document.title;
    document.title = safeTitle;

    let isCleanedUp = false;
    const cleanup = (): void =>
    {
        if (isCleanedUp) return;
        isCleanedUp = true;
        document.title = originalPageTitle;
        window.removeEventListener('afterprint', cleanup);
        printFrame.remove();
    };
    frameWindow.addEventListener('afterprint', cleanup);
    window.addEventListener('afterprint', cleanup);
    window.setTimeout(cleanup, PRINT_IFRAME_FALLBACK_CLEANUP_MS);

    frameWindow.focus();
    frameWindow.print();
};
