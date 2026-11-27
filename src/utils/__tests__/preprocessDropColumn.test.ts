/**
 * 專家回饋 P-01：資料前處理新增「刪除整欄」(drop_column)。
 * 差分隱私模式不負責刪欄位，姓名、身分證號等直接識別欄位在前處理就先移除。
 */
import { describe, expect, it } from 'vitest';
import { buildPreprocessBlock, convertPreprocessStep } from '../preprocessConfig';
import { parseBackendPreprocessBlock } from '../preprocessConfigImport';
import { applyPreprocessSteps, PREPROCESS_DROPPED_COLUMN_PREVIEW_TEXT } from '../preprocessSteps';
import { describePreprocessStep } from '../reportDescriptions';

const DROP = { action: 'drop_column', params: {} };

describe('drop_column：組出送後端的設定', () => {
    it('單一步驟對應後端的 drop_column，沒有參數', () => {
        expect(convertPreprocessStep(DROP)).toEqual({ action: 'drop_column', params: {} });
    });

    it('欄位的步驟鏈到 drop_column 為止：其後的步驟不送', () => {
        const block = buildPreprocessBlock(
            ['姓名', '年齡'],
            { 姓名: [{ action: 'trim', params: { mode: 'edges' } }, DROP, { action: 'trim', params: { mode: 'all' } }] },
            {}
        );
        expect(block?.columns).toEqual([
            { column: '姓名', actions: [{ action: 'trim', params: { mode: 'edges' } }, { action: 'drop_column', params: {} }] },
        ]);
    });

    it('整欄都刪了，就不再附上缺失值處理（後端不允許刪除之後再處理同一欄）', () => {
        const block = buildPreprocessBlock(['姓名'], { 姓名: [DROP] }, { 姓名: { strategy: 'drop' } });
        expect(block?.columns).toEqual([{ column: '姓名', actions: [{ action: 'drop_column', params: {} }] }]);
    });

    it('沒有刪除步驟的欄位，缺失值處理照常附在最後', () => {
        const block = buildPreprocessBlock(['年齡'], {}, { 年齡: { strategy: 'drop' } });
        expect(block?.columns).toEqual([{ column: '年齡', actions: [{ action: 'drop_nulls', params: {} }] }]);
    });

    it('只有刪除欄位也算有前處理動作（Step4 才會跑前處理）', () => {
        expect(buildPreprocessBlock(['姓名'], { 姓名: [DROP] }, {})).not.toBeNull();
    });
});

describe('drop_column：匯入設定檔', () => {
    const backendBlock = {
        enabled: true,
        columns: [
            { column: '姓名', actions: [{ action: 'trim', params: { mode: 'edges' } }, { action: 'drop_column', params: {} }] },
            { column: '身分證號', actions: [{ action: 'drop_column', params: {} }] },
        ],
    };

    it('讀成前端步驟，再組回去內容一致（匯出再匯入不變）', () => {
        const parsed = parseBackendPreprocessBlock(backendBlock);
        expect(parsed.preprocessingRules['姓名']).toEqual([{ action: 'trim', params: { mode: 'edges' } }, DROP]);
        expect(parsed.preprocessingRules['身分證號']).toEqual([DROP]);
        expect(parsed.warnings).toEqual([]);

        const rebuilt = buildPreprocessBlock(parsed.columnNames, parsed.preprocessingRules, parsed.missingValueRules);
        expect(rebuilt?.columns).toEqual(backendBlock.columns);
    });

    it('設定檔在 drop_column 之後還有步驟：略過並提示', () => {
        const parsed = parseBackendPreprocessBlock({
            enabled: true,
            columns: [{ column: '姓名', actions: [{ action: 'drop_column', params: {} }, { action: 'trim', params: { mode: 'all' } }] }],
        });
        expect(parsed.preprocessingRules['姓名']).toEqual([DROP]);
        expect(parsed.warnings.some((warningText) => warningText.includes('姓名') && warningText.includes('刪除欄位'))).toBe(true);
    });
});

describe('drop_column：畫面預覽與報告文字', () => {
    it('預覽顯示整欄刪除，不論該格有沒有值', () => {
        expect(applyPreprocessSteps('王小明', [DROP])).toBe(PREPROCESS_DROPPED_COLUMN_PREVIEW_TEXT);
        expect(applyPreprocessSteps('', [DROP])).toBe(PREPROCESS_DROPPED_COLUMN_PREVIEW_TEXT);
        expect(applyPreprocessSteps(null, [{ action: 'trim', params: { mode: 'edges' } }, DROP])).toBe(PREPROCESS_DROPPED_COLUMN_PREVIEW_TEXT);
    });

    it('沒有刪除步驟時預覽維持原行為', () => {
        expect(applyPreprocessSteps('  a  ', [{ action: 'trim', params: { mode: 'edges' } }])).toBe('a');
    });

    it('報告用白話寫出刪除整欄', () => {
        expect(describePreprocessStep(DROP)).toContain('刪除整欄');
    });
});
