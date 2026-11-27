// @vitest-environment jsdom
/**
 * 專家回饋 P-06：Step4 的差分隱私「各欄位資料變化」卡片與合規報告。
 */
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

class MockResizeObserver { observe(): void {} unobserve(): void {} disconnect(): void {} }
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
}
const stableTranslation = vi.hoisted(() => ({
    t: (key: string, fallback?: unknown, options?: Record<string, unknown>) => {
        const template = typeof fallback === 'string' ? fallback : key;
        return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(options?.[name] ?? ''));
    }
}));
vi.mock('react-i18next', () => ({ useTranslation: () => stableTranslation }));

import { DpUtilityCard } from '../../components/DpUtilityCard';
import { describeDpColumnUtility, type DpUtilityResult } from '../dpUtility';

const result: DpUtilityResult = {
    evaluatedRows: 1000, sampled: false, largeDeviationColumns: ['薪資', '地區'],
    columns: [
        { column: '年齡', type: 'continuous', epsilon: 5, evaluatedCount: 1000, level: 2, meanChangePercent: 8.2, stdChangePercent: -3.1, meanAbsoluteError: 13.6, errorPercentOfRange: 11.3, atLowerBoundPercent: 12.5, atUpperBoundPercent: 0 },
        { column: '薪資', type: 'continuous', epsilon: 5, evaluatedCount: 1000, level: 3, meanChangePercent: 31, stdChangePercent: 100, meanAbsoluteError: 40000, errorPercentOfRange: 13, atLowerBoundPercent: 0, atUpperBoundPercent: 20 },
        { column: '地區', type: 'categorical', epsilon: 1, evaluatedCount: 1000, level: 3, unchangedPercent: 47.8, distributionSimilarityPercent: 80 },
    ],
};

describe('DpUtilityCard', () => {
    afterEach(() => cleanup());

    it('逐欄列出資料變化與偏差程度，並註明僅供參考', () => {
        render(<DpUtilityCard result={result} />);
        const card = screen.getByTestId('dp-utility-card');
        expect(card.textContent).toContain('年齡');
        expect(card.textContent).toContain('平均 +8.2%');
        expect(card.textContent).toContain('47.8% 保持原值');
        expect(card.textContent).toContain('僅供參考');
        expect(card.textContent).toContain('以全部 1,000 列計算');
    });

    it('偏差程度大的欄位另外標出', () => {
        render(<DpUtilityCard result={result} />);
        expect(screen.getByTestId('dp-utility-large-deviation').textContent).toContain('薪資、地區');
    });

    it('沒有偏差大的欄位時不顯示警告；抽樣時註明', () => {
        render(<DpUtilityCard result={{ ...result, largeDeviationColumns: [], sampled: true, evaluatedRows: 200000 }} />);
        expect(screen.queryByTestId('dp-utility-large-deviation')).toBeNull();
        expect(screen.getByTestId('dp-utility-card').textContent).toContain('取前 200,000 列計算');
    });
});

describe('describeDpColumnUtility', () => {
    it('數值欄：被拉到下界的比例 ≥ 5% 才提示（年齡被加噪成 0 歲的情況）', () => {
        expect(describeDpColumnUtility(result.columns[0])).toContain('12.5% 的值被拉到下界');
        expect(describeDpColumnUtility(result.columns[1])).toContain('20.0% 的值被拉到上界');
        expect(describeDpColumnUtility({ ...result.columns[0], atLowerBoundPercent: 1 })).not.toContain('下界');
    });

    it('日期欄', () => {
        expect(describeDpColumnUtility({ column: '生日', type: 'datetime', evaluatedCount: 10, level: 1, meanShiftDays: 372, maxShiftDays: 4234 })).toContain('平均位移 372.0 天（最大 4234.0 天）');
    });
});
