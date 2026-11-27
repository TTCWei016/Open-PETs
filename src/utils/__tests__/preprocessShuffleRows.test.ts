/**
 * 專家回饋 P-04：列順序隨機重排改為資料預先處理的選用功能（預設不啟用）。
 */
import { describe, expect, it } from 'vitest';
import { buildPreprocessBlock } from '../preprocessConfig';
import { parseBackendPreprocessBlock } from '../preprocessConfigImport';
import { describePreprocessingForReport } from '../reportDescriptions';

describe('shuffle_rows：組出送後端的設定', () => {
    it('沒有任何欄位動作、也沒啟用重排：不需要前處理（回傳 null）', () => {
        expect(buildPreprocessBlock(['年齡'], {}, {})).toBeNull();
        expect(buildPreprocessBlock(['年齡'], {}, {}, false)).toBeNull();
    });

    it('只啟用重排：欄位清單可以是空的，仍會送出前處理區塊', () => {
        const block = buildPreprocessBlock(['年齡'], {}, {}, true);
        expect(block).not.toBeNull();
        expect(block?.columns).toEqual([]);
        expect(block?.shuffle_rows).toBe(true);
    });

    it('有欄位動作時一併帶 shuffle_rows；沒啟用就不送這個欄位', () => {
        const rules = { 地址: [{ action: 'trim', params: { mode: 'edges' } }] };
        expect(buildPreprocessBlock(['地址'], rules, {}, true)?.shuffle_rows).toBe(true);
        expect(buildPreprocessBlock(['地址'], rules, {}, false)).not.toHaveProperty('shuffle_rows');
    });
});

describe('shuffle_rows：匯入設定檔', () => {
    it('讀得到 shuffle_rows，組回去內容一致', () => {
        const backendBlock = { enabled: true, algorithm: 'sha3-256', columns: [], shuffle_rows: true };
        const parsed = parseBackendPreprocessBlock(backendBlock);
        expect(parsed.shuffleRows).toBe(true);
        const rebuilt = buildPreprocessBlock(parsed.columnNames, parsed.preprocessingRules, parsed.missingValueRules, parsed.shuffleRows);
        expect(rebuilt?.shuffle_rows).toBe(true);
    });

    it('設定檔沒寫就是不重排', () => {
        expect(parseBackendPreprocessBlock({ enabled: true, columns: [] }).shuffleRows).toBe(false);
        expect(parseBackendPreprocessBlock(null).shuffleRows).toBe(false);
    });
});

describe('shuffle_rows：報告描述', () => {
    it('啟用時報告多一列「整份資料：隨機重排列順序」', () => {
        const rows = describePreprocessingForReport(['地址'], { 地址: [{ action: 'trim', params: { mode: 'edges' } }] }, {}, true);
        expect(rows[rows.length - 1]).toEqual({ columnName: '（整份資料）', stepsText: '隨機重排列順序' });
    });

    it('沒啟用就沒有這一列', () => {
        expect(describePreprocessingForReport(['地址'], {}, {}, false)).toEqual([]);
    });

    it('欄位被刪除時，報告只寫刪除，不再寫缺失值處理', () => {
        const rows = describePreprocessingForReport(['姓名'], { 姓名: [{ action: 'drop_column', params: {} }] }, { 姓名: { strategy: 'drop' } });
        expect(rows).toHaveLength(1);
        expect(rows[0].stepsText).toContain('刪除整欄');
        expect(rows[0].stepsText).not.toContain('缺值');
    });
});
