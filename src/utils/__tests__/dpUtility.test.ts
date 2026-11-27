/**
 * 專家回饋 P-06：差分隱私的資料實用性——逐欄比較處理前後，抓得出薪資平均被拉高、年齡被加噪成 0 這類問題。
 */
import { describe, expect, it } from 'vitest';
import { computeDpUtilityFromRows, type DpUtilityColumnSpec } from '../dpUtility';

const rowsOf = (header: string[], body: Array<Array<string | number>>): string[][] => [header, ...body.map((row) => row.map(String))];

describe('數值欄', () => {
    const spec: DpUtilityColumnSpec = { name: '薪資', type: 'continuous', epsilon: 5, lowerBound: 0, upperBound: 300000 };

    it('沒有變化：平均、標準差變化 0，偏差程度小', () => {
        const rows = rowsOf(['薪資'], [[40000], [60000], [80000], [100000]]);
        const result = computeDpUtilityFromRows(rows, rows, [spec])!;
        const column = result.columns[0];
        expect(column.meanChangePercent).toBeCloseTo(0);
        expect(column.stdChangePercent).toBeCloseTo(0);
        expect(column.meanAbsoluteError).toBe(0);
        expect(column.level).toBe(1);
        expect(result.largeDeviationColumns).toEqual([]);
    });

    it('平均被拉高 31%：算出平均變化、標準差倍增、偏差程度大（專家情境 2 的薪資）', () => {
        const before = rowsOf(['薪資'], [[40000], [60000], [80000], [100000]]); // 平均 70000
        const after = rowsOf(['薪資'], [[20000], [90000], [150000], [300000]]); // 平均 140000，被拉高
        const column = computeDpUtilityFromRows(before, after, [spec])!.columns[0];
        expect(column.meanChangePercent!).toBeCloseTo(100);
        expect(column.stdChangePercent!).toBeGreaterThan(100);
        expect(column.level).toBe(3);
    });

    it('平均絕對誤差占範圍的比例：以使用者設的上下限為範圍', () => {
        const before = rowsOf(['薪資'], [[100000], [100000]]);
        const after = rowsOf(['薪資'], [[130000], [70000]]); // 誤差各 3 萬，上下限寬度 30 萬
        const column = computeDpUtilityFromRows(before, after, [spec])!.columns[0];
        expect(column.meanAbsoluteError).toBeCloseTo(30000);
        expect(column.errorPercentOfRange!).toBeCloseTo(10);
    });

    it('落在邊界的比例：年齡 0～120，被拉到 0 的成年人要看得出來', () => {
        const ageSpec: DpUtilityColumnSpec = { name: '年齡', type: 'continuous', epsilon: 5, lowerBound: 0, upperBound: 120 };
        const before = rowsOf(['年齡'], [[30], [40], [50], [60]]);
        const after = rowsOf(['年齡'], [[0], [0], [51], [120]]);
        const column = computeDpUtilityFromRows(before, after, [ageSpec])!.columns[0];
        expect(column.atLowerBoundPercent).toBeCloseTo(50);
        expect(column.atUpperBoundPercent).toBeCloseTo(25);
    });

    it('沒設上下限：落在邊界比例為 null，範圍改用原始資料範圍', () => {
        const noBounds: DpUtilityColumnSpec = { name: '薪資', type: 'continuous' };
        const before = rowsOf(['薪資'], [[0], [100]]);
        const after = rowsOf(['薪資'], [[10], [100]]);
        const column = computeDpUtilityFromRows(before, after, [noBounds])!.columns[0];
        expect(column.atLowerBoundPercent).toBeNull();
        expect(column.errorPercentOfRange!).toBeCloseTo(5);
    });

    it('空值與非數字的列不參與計算', () => {
        const before = rowsOf(['薪資'], [[100], [''], ['abc'], [200]]);
        const after = rowsOf(['薪資'], [[100], [''], ['x'], [200]]);
        expect(computeDpUtilityFromRows(before, after, [spec])!.columns[0].evaluatedCount).toBe(2);
    });
});

describe('類別欄', () => {
    const spec: DpUtilityColumnSpec = { name: '地區', type: 'categorical', epsilon: 1 };

    it('保持原值的比例與分布相似度', () => {
        const before = rowsOf(['地區'], [['北'], ['北'], ['南'], ['南']]);
        const after = rowsOf(['地區'], [['北'], ['南'], ['南'], ['南']]);
        const column = computeDpUtilityFromRows(before, after, [spec])!.columns[0];
        expect(column.unchangedPercent).toBeCloseTo(75);
        expect(column.distributionSimilarityPercent!).toBeCloseTo(75); // 北 50→25、南 50→75，總變異距離 0.25
    });

    it('只有 47.8% 保持原值（專家情境 2 的地區）：偏差程度大', () => {
        const body = Array.from({ length: 1000 }, (_, index) => [index < 478 ? 'A' : 'B']);
        const original = rowsOf(['地區'], Array.from({ length: 1000 }, () => ['A']));
        const column = computeDpUtilityFromRows(original, rowsOf(['地區'], body), [spec])!.columns[0];
        expect(column.unchangedPercent!).toBeCloseTo(47.8);
        expect(column.level).toBe(3);
    });
});

describe('日期欄', () => {
    const spec: DpUtilityColumnSpec = { name: '生日', type: 'datetime', epsilon: 1 };

    it('平均與最大位移（天）、占原始資料跨度的比例', () => {
        const before = rowsOf(['生日'], [['1990-01-01'], ['1990-12-31'], ['2000-01-01']]);
        const after = rowsOf(['生日'], [['1990-01-11'], ['1990-12-21'], ['2000-01-01']]);
        const column = computeDpUtilityFromRows(before, after, [spec])!.columns[0];
        expect(column.meanShiftDays!).toBeCloseTo(20 / 3);
        expect(column.maxShiftDays!).toBeCloseTo(10);
        expect(column.shiftPercentOfSpan!).toBeLessThan(1);
        expect(column.level).toBe(1);
    });
});

describe('整體', () => {
    it('偏差程度大的欄位會列出來', () => {
        const before = rowsOf(['薪資', '地區'], [[100, '北'], [100, '北'], [100, '北'], [100, '北']]);
        const after = rowsOf(['薪資', '地區'], [[100, '南'], [100, '南'], [100, '南'], [100, '北']]);
        const result = computeDpUtilityFromRows(before, after, [
            { name: '薪資', type: 'continuous' }, { name: '地區', type: 'categorical' }
        ])!;
        expect(result.largeDeviationColumns).toEqual(['地區']);
    });

    it('列數不同無法逐列配對：不顯示數字（回傳 null），抽樣時例外', () => {
        const before = rowsOf(['薪資'], [[1], [2], [3]]);
        const after = rowsOf(['薪資'], [[1], [2]]);
        expect(computeDpUtilityFromRows(before, after, [{ name: '薪資', type: 'continuous' }])).toBeNull();
        expect(computeDpUtilityFromRows(before, after, [{ name: '薪資', type: 'continuous' }], true)?.evaluatedRows).toBe(2);
    });

    it('欄位不在資料裡就略過；全部略過回傳 null', () => {
        const rows = rowsOf(['薪資'], [[1], [2]]);
        expect(computeDpUtilityFromRows(rows, rows, [{ name: '不存在', type: 'continuous' }])).toBeNull();
    });
});
