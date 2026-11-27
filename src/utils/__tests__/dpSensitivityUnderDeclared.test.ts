/**
 * 專家回饋 P-07：敏感度小於上下限寬度時，實際保護力低於顯示的 ε，要能偵測並算出有效 ε。
 */
import { describe, expect, it } from 'vitest';
import { detectUnderDeclaredDpSensitivity } from '../pipelineConfig';

describe('detectUnderDeclaredDpSensitivity', () => {
    it('年齡 0～120、敏感度 30、ε=1：有效 ε = 1 × 120 ÷ 30 = 4', () => {
        const result = detectUnderDeclaredDpSensitivity({ lowerBound: 0, upperBound: 120, sensitivity: 30, epsilon: 1 }, false);
        expect(result).toEqual({ declared: 30, width: 120, effectiveEpsilon: 4 });
    });

    it('敏感度等於寬度、大於寬度、或留空（自動＝寬度）：不警告', () => {
        expect(detectUnderDeclaredDpSensitivity({ lowerBound: 0, upperBound: 120, sensitivity: 120, epsilon: 1 }, false)).toBeNull();
        expect(detectUnderDeclaredDpSensitivity({ lowerBound: 0, upperBound: 120, sensitivity: 500, epsilon: 1 }, false)).toBeNull();
        expect(detectUnderDeclaredDpSensitivity({ lowerBound: 0, upperBound: 120, sensitivity: undefined, epsilon: 1 }, false)).toBeNull();
        expect(detectUnderDeclaredDpSensitivity({ lowerBound: 0, upperBound: 120, sensitivity: '', epsilon: 1 }, false)).toBeNull();
    });

    it('沒設上下限：無從比較，不警告', () => {
        expect(detectUnderDeclaredDpSensitivity({ lowerBound: undefined, upperBound: undefined, sensitivity: 30, epsilon: 1 }, false)).toBeNull();
    });

    it('專家報告的薪資：截斷 0～30 萬、敏感度 12.5 萬、ε=5 → 有效 ε = 12', () => {
        const result = detectUnderDeclaredDpSensitivity({ lowerBound: 0, upperBound: 300000, sensitivity: 125000, epsilon: 5 }, false);
        expect(result?.effectiveEpsilon).toBeCloseTo(12);
    });

    it('日期欄：以雜訊單位（天）計寬度；1930～2026 約 35,000 天，敏感度 365 天偏小', () => {
        const result = detectUnderDeclaredDpSensitivity({ lowerBound: '1930-01-01', upperBound: '2026-12-31', sensitivity: 365, epsilon: 1, noiseUnit: 'day' }, true);
        expect(result).not.toBeNull();
        expect(result!.width).toBeGreaterThan(35000);
        expect(result!.effectiveEpsilon!).toBeGreaterThan(90);
    });

    it('ε 無效時仍警告，只是不給有效 ε', () => {
        const result = detectUnderDeclaredDpSensitivity({ lowerBound: 0, upperBound: 120, sensitivity: 30, epsilon: undefined }, false);
        expect(result).toEqual({ declared: 30, width: 120, effectiveEpsilon: null });
    });
});
