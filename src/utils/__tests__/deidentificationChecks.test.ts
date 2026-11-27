/**
 * 專家回饋 P-03：各項去識別化檢查分別標示結果；沒選用的不寫成通過；輸出 0 筆判未通過。
 */
import { describe, expect, it } from 'vitest';
import { buildDeidentificationChecks } from '../complianceReport';
import type { DpQualityReport, KAnonymityQualityReport } from '../../api/apiService';

const kReport = (overrides: Partial<KAnonymityQualityReport> = {}): KAnonymityQualityReport => ({
    is_valid: true, k_passed: true, l_passed: true, t_passed: true, suppression_rate_percent: 2, suppression_unit: 'row',
    message: '', recommendations: [], applied_defaults: [], ...overrides
});
const build = (report: KAnonymityQualityReport, extra: { lRequested?: boolean; tRequested?: boolean; maxSuppressionPercent?: number } = {}) =>
    buildDeidentificationChecks({ privacyMode: 'k-anonymity', kReport: report, lRequested: false, tRequested: false, maxSuppressionPercent: 20, budgetLimitEpsilon: 10, ...extra });
const resultOf = (checks: ReturnType<typeof build>, key: string) => checks.find((checkItem) => checkItem.key === key)?.result;

describe('buildDeidentificationChecks（K-匿名）', () => {
    it('沒設定 l／t：標示未選用，不是通過', () => {
        const checks = build(kReport({ l_checked: false, t_checked: false }));
        expect(resultOf(checks, 'l')).toBe('not_selected');
        expect(resultOf(checks, 't')).toBe('not_selected');
        expect(resultOf(checks, 'k')).toBe('passed');
    });

    it('後端沒回 l_checked（舊版）時，依使用者在畫面是否啟用判斷', () => {
        expect(resultOf(build(kReport(), { lRequested: true }), 'l')).toBe('passed');
        expect(resultOf(build(kReport(), { lRequested: false }), 'l')).toBe('not_selected');
    });

    it('各項分別標示：l 未通過時只有 l 是未通過', () => {
        const checks = build(kReport({ l_checked: true, l_passed: false }));
        expect(resultOf(checks, 'l')).toBe('failed');
        expect(resultOf(checks, 'k')).toBe('passed');
        expect(resultOf(checks, 'suppression')).toBe('passed');
    });

    it('抑制率超過上限：只有抑制率是未通過', () => {
        const checks = build(kReport({ suppression_rate_percent: 35 }), { maxSuppressionPercent: 30 });
        expect(resultOf(checks, 'suppression')).toBe('failed');
        expect(resultOf(checks, 'k')).toBe('passed');
    });

    it('輸出 0 筆：輸出、k、l、t 都是未通過', () => {
        const checks = build(kReport({ output_empty: true, l_checked: true, t_checked: true }));
        expect(resultOf(checks, 'output')).toBe('failed');
        expect(resultOf(checks, 'k')).toBe('failed');
        expect(resultOf(checks, 'l')).toBe('failed');
        expect(resultOf(checks, 't')).toBe('failed');
    });

    it('沒有報告時不產生任何檢查項', () => {
        expect(build(null as unknown as KAnonymityQualityReport)).toEqual([]);
    });
});

describe('buildDeidentificationChecks（差分隱私）', () => {
    const dpReport = (consumed: number): DpQualityReport => ({ consumed_epsilon: consumed, consumed_delta: 0, accumulated_epsilon: consumed, accumulated_delta: 0, message: '', per_column: [] });
    const buildDp = (consumed: number, limit: number) => buildDeidentificationChecks({ privacyMode: 'differential-privacy', dpReport: dpReport(consumed), lRequested: false, tRequested: false, maxSuppressionPercent: 20, budgetLimitEpsilon: limit });

    it('預算未超過設定上限：通過；超過：未通過', () => {
        expect(buildDp(5, 10)).toEqual([{ key: 'budget', result: 'passed' }]);
        expect(buildDp(12, 10)).toEqual([{ key: 'budget', result: 'failed' }]);
    });
});
