/**
 * 專家回饋 P-01／P-02：檢測結論只適用「已設定去識別化處理的欄位」；原樣輸出的欄位要列出來，
 * 風險評估沒納入的原樣輸出欄位也要列出來。
 */
import { describe, expect, it } from 'vitest';
import { computeOutputScope } from '../complianceReport';
import { buildDataUsageNotesText, getDataUsageNotes } from '../dataUsageNotes';

const roleMap = (roles: Record<string, { role: string; maskStrategy?: string }>) => (name: string) => roles[name] ?? { role: 'Non-sensitive' };

describe('computeOutputScope：差分隱私', () => {
    const base = {
        privacyMode: 'differential-privacy',
        columnNames: ['年齡', '薪資', '疾病', '縣市', '姓名'],
        resolveColumnRole: roleMap({}),
        preprocessingRules: {},
    };

    it('已啟用 DP 的欄位算已處理；其餘原樣輸出，姓名這類沒處理的欄位也會被列出來', () => {
        const scope = computeOutputScope({ ...base, dpEnabledFieldNames: ['年齡', '薪資'], evaluatedColumns: ['年齡', '薪資', '疾病'] });
        expect(scope.processedColumns).toEqual(['年齡', '薪資']);
        expect(scope.rawColumns).toEqual(['疾病', '縣市', '姓名']);
    });

    it('未納入風險評估的原樣輸出欄位單獨列出（疾病有納入評估，不在其中）', () => {
        const scope = computeOutputScope({ ...base, dpEnabledFieldNames: ['年齡', '薪資'], evaluatedColumns: ['年齡', '薪資', '疾病'] });
        expect(scope.unevaluatedRawColumns).toEqual(['縣市', '姓名']);
    });

    it('前處理已刪除整欄的欄位，不在輸出裡，兩邊都不列', () => {
        const scope = computeOutputScope({ ...base, dpEnabledFieldNames: ['年齡'], evaluatedColumns: [], preprocessingRules: { 姓名: [{ action: 'drop_column' }] } });
        expect([...scope.processedColumns, ...scope.rawColumns]).not.toContain('姓名');
    });

    it('前處理做了雜湊的欄位算已處理；只去空白、轉型這類清洗不算去識別化', () => {
        const scope = computeOutputScope({
            ...base, dpEnabledFieldNames: [], evaluatedColumns: [],
            preprocessingRules: { 姓名: [{ action: 'hash' }], 縣市: [{ action: 'trim' }, { action: 'type_cast' }] }
        });
        expect(scope.processedColumns).toEqual(['姓名']);
        expect(scope.rawColumns).toContain('縣市');
    });
});

describe('computeOutputScope：K-匿名', () => {
    const resolveColumnRole = roleMap({
        姓名: { role: 'Identifier', maskStrategy: 'remove' },
        身分證號: { role: 'Identifier', maskStrategy: 'hash' },
        年齡: { role: 'Quasi-identifier' },
        疾病: { role: 'Sensitive' },
        備註: { role: 'Non-sensitive' },
    });
    const input = { privacyMode: 'k-anonymity', columnNames: ['姓名', '身分證號', '年齡', '疾病', '備註'], resolveColumnRole, dpEnabledFieldNames: [], preprocessingRules: {} };

    it('識別欄位（雜湊）與間接識別欄位算已處理；被刪除的識別欄位不在輸出裡；敏感與非敏感欄位是原值', () => {
        const scope = computeOutputScope({ ...input, evaluatedColumns: ['年齡', '疾病'] });
        expect(scope.processedColumns).toEqual(['身分證號', '年齡']);
        expect(scope.rawColumns).toEqual(['疾病', '備註']);
        expect(scope.unevaluatedRawColumns).toEqual(['備註']);
    });
});

describe('資料使用注意事項', () => {
    it('有原樣輸出的欄位時，明列欄位並說明不在檢測結論範圍內', () => {
        const notes = getDataUsageNotes('differential-privacy', ['姓名', '身分證號']);
        const rawNote = notes.find((noteText) => noteText.includes('未經去識別化處理、原樣輸出'));
        expect(rawNote).toContain('姓名、身分證號');
        expect(rawNote).toContain('不在檢測結論的範圍內');
    });

    it('沒有原樣輸出的欄位時，不多出這一條', () => {
        expect(getDataUsageNotes('k-anonymity', []).some((noteText) => noteText.includes('未經去識別化處理、原樣輸出'))).toBe(false);
        expect(getDataUsageNotes('k-anonymity').some((noteText) => noteText.includes('未經去識別化處理、原樣輸出'))).toBe(false);
    });

    it('第一條不再宣稱整份資料都已去識別化，並限定結論範圍', () => {
        const [firstNote] = getDataUsageNotes('differential-privacy');
        expect(firstNote).not.toContain('本資料已經過去識別化處理');
        expect(firstNote).toContain('只適用這些欄位');
    });

    it('隨資料附上的文字檔也列出原樣輸出的欄位', () => {
        const text = buildDataUsageNotesText({ mode: 'differential-privacy', rawOutputColumns: ['姓名'], generatedAt: new Date(2026, 10, 26, 9, 0) });
        expect(text).toContain('原樣輸出：姓名');
    });
});
