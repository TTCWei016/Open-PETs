// @vitest-environment jsdom
/**
 * 專家回饋 P-13：報告改用瀏覽器列印（另存為 PDF 才有文字層）。
 * jsdom 沒有列印功能（print 只是未實作的空函式），這裡確認：報告被複製進隱藏頁框、頁框有列印樣式與標題、列印結束後清掉並還原標題。
 * 真的列印預覽與 PDF 文字層，需在瀏覽器實機確認。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRINT_REPORT_STYLE_TEXT, printReportElement, toSafeDocumentTitle } from '../printReport';

const buildReport = (): HTMLElement =>
{
    const report = document.createElement('div');
    report.setAttribute('data-testid', 'compliance-report-document');
    report.innerHTML = '<h2>隱私風險評估報告</h2><table><tbody><tr><td>報告編號</td><td>CERT-1</td></tr></tbody></table>';
    return report;
};

describe('printReportElement', () =>
{
    afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

    it('檔名不安全的字元換成底線', () =>
    {
        expect(toSafeDocumentTitle('Privacy Audit: A/B*C')).toBe('Privacy_Audit_A_B_C');
    });

    it('列印樣式：A4、列印背景色、取消 overflow、區塊不切開', () =>
    {
        expect(PRINT_REPORT_STYLE_TEXT).toContain('size: A4');
        expect(PRINT_REPORT_STYLE_TEXT).toContain('print-color-adjust: exact');
        expect(PRINT_REPORT_STYLE_TEXT).toContain('overflow: visible !important');
        expect(PRINT_REPORT_STYLE_TEXT).toContain('break-inside: avoid');
    });

    it('複製報告進隱藏頁框；標題暫時改為建議檔名，列印結束後還原並移除頁框', () =>
    {
        document.title = '隱私強化工具包';
        const sourceReport = buildReport();
        document.body.appendChild(sourceReport);

        printReportElement(sourceReport, 'Privacy_Audit_Certificate_CERT-1');

        const frame = document.querySelector('iframe[data-testid="print-report-frame"]') as HTMLIFrameElement;
        expect(frame).not.toBeNull();
        expect(frame.contentDocument?.title).toBe('Privacy_Audit_Certificate_CERT-1');
        expect(frame.contentDocument?.body.textContent).toContain('隱私風險評估報告');
        expect(frame.contentDocument?.querySelector('style')?.textContent).toContain('@page');
        expect(document.title).toBe('Privacy_Audit_Certificate_CERT-1');

        window.dispatchEvent(new Event('afterprint'));
        expect(document.title).toBe('隱私強化工具包');
        expect(document.querySelector('iframe[data-testid="print-report-frame"]')).toBeNull();
        // 來源報告不受影響
        expect(sourceReport.isConnected).toBe(true);
    });
});
