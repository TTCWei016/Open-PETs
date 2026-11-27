/**
 * ============================================================================
 * 檔案名稱 (File): dpUtility.ts
 * 模組功能 (Description): 差分隱私「資料實用性」：處理前後逐欄比較，看加噪讓資料變了多少
 * ============================================================================
 * ★ 專家回饋 P-06：差分隱私模式原本沒有任何實用性指標，使用者看不出薪資平均被拉高 31%、
 *   成年人被加噪成 0 歲這類問題。通用工具無法預測資料欄位之間的關聯與合理範圍，因此只做逐欄、
 *   與使用者設定的上下限有關的統計比較，並且明講「僅供參考」，不另訂通過／不通過。
 *
 * 逐欄指標（差分隱私逐筆加噪，列數與列順序不變，故前後逐列配對）：
 *   - 數值：平均與標準差的變化（%）、平均絕對誤差（占範圍的 %；範圍＝使用者設的上下限，沒設用原始資料範圍）、
 *     落在上／下界的比例（clamp 超界處理會讓值堆在邊界，下界比例高常代表有大量值被拉到 0）
 *   - 類別：保持原值的比例、前後分布相似度（1 − 總變異距離）
 *   - 日期：平均與最大位移（天）、平均位移占原始資料跨度的 %
 *   「偏差程度」只是方便掃讀的參考：主要指標 ≤ 5% 小、≤ 20% 中、> 20% 大（5% 取自驗證指標建議值，依用途調整）。
 * 大檔只取前 20 萬列計算（與 K-匿名的相似度相同），結果註明抽樣。
 */
import { LARGE_FILE_SAMPLING_BYTES, stripLeadingBom } from './blobStreaming';
import { readCsvBlobRows } from './csvBlobParse';

export type DpUtilityColumnType = 'continuous' | 'categorical' | 'datetime';
export type DpDeviationLevel = 1 | 2 | 3;

export const DP_DEVIATION_SMALL_PERCENT = 5;
export const DP_DEVIATION_LARGE_PERCENT = 20;
export const DP_UTILITY_SAMPLE_ROWS = 200_000;

export interface DpUtilityColumnSpec {
    name: string;
    type: DpUtilityColumnType;
    epsilon?: number;
    /** 數值欄的上下限（使用者設定的超界處理範圍）；沒設為 null／undefined */
    lowerBound?: number | null;
    upperBound?: number | null;
}

export interface DpColumnUtility {
    column: string;
    type: DpUtilityColumnType;
    epsilon?: number;
    evaluatedCount: number;
    level: DpDeviationLevel;
    /** 數值欄 */
    meanBefore?: number;
    meanAfter?: number;
    meanChangePercent?: number | null;
    stdBefore?: number;
    stdAfter?: number;
    stdChangePercent?: number | null;
    meanAbsoluteError?: number;
    errorPercentOfRange?: number | null;
    atLowerBoundPercent?: number | null;
    atUpperBoundPercent?: number | null;
    /** 類別欄 */
    unchangedPercent?: number;
    distributionSimilarityPercent?: number;
    /** 日期欄 */
    meanShiftDays?: number;
    maxShiftDays?: number;
    shiftPercentOfSpan?: number | null;
}

export interface DpUtilityResult {
    columns: DpColumnUtility[];
    evaluatedRows: number;
    sampled: boolean;
    /** 偏差程度為「大」的欄位名稱 */
    largeDeviationColumns: string[];
}

const cleanName = (nameText: string): string => String(nameText ?? '').replace(/^[\uFEFF\u200B]+/, '').trim();
const cellText = (value: unknown): string => (value === undefined || value === null ? '' : String(value).trim());
const toPercent = (ratio: number): number => ratio * 100;

const levelFromPercent = (percentValue: number | null): DpDeviationLevel => {
    if (percentValue === null || !Number.isFinite(percentValue)) return 1;
    const magnitude = Math.abs(percentValue);
    return magnitude <= DP_DEVIATION_SMALL_PERCENT ? 1 : magnitude <= DP_DEVIATION_LARGE_PERCENT ? 2 : 3;
};
const maxLevel = (levels: DpDeviationLevel[]): DpDeviationLevel => (Math.max(1, ...levels) as DpDeviationLevel);

const meanOf = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
const stdOf = (values: number[], mean: number): number => Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
const relativeChangePercent = (before: number, after: number): number | null =>
    Math.abs(before) < 1e-12 ? null : toPercent((after - before) / Math.abs(before));

const evaluateContinuous = (spec: DpUtilityColumnSpec, before: string[], after: string[]): DpColumnUtility | null => {
    const originalValues: number[] = [];
    const processedValues: number[] = [];
    for (let rowIndex = 0; rowIndex < before.length; rowIndex += 1) {
        const originalNumber = before[rowIndex] === '' ? NaN : Number(before[rowIndex]);
        const processedNumber = after[rowIndex] === '' ? NaN : Number(after[rowIndex]);
        if (Number.isNaN(originalNumber) || Number.isNaN(processedNumber)) continue;
        originalValues.push(originalNumber);
        processedValues.push(processedNumber);
    }
    if (originalValues.length === 0) return null;
    const meanBefore = meanOf(originalValues);
    const meanAfter = meanOf(processedValues);
    const stdBefore = stdOf(originalValues, meanBefore);
    const stdAfter = stdOf(processedValues, meanAfter);
    const meanAbsoluteError = meanOf(originalValues.map((value, index) => Math.abs(value - processedValues[index])));
    const hasBounds = typeof spec.lowerBound === 'number' && typeof spec.upperBound === 'number' && spec.upperBound > spec.lowerBound;
    const rangeWidth = hasBounds
        ? (spec.upperBound as number) - (spec.lowerBound as number)
        : Math.max(...originalValues) - Math.min(...originalValues);
    const errorPercentOfRange = rangeWidth > 0 ? toPercent(meanAbsoluteError / rangeWidth) : null;
    const tolerance = rangeWidth > 0 ? rangeWidth * 1e-9 : 1e-9;
    const atLowerBoundPercent = hasBounds ? toPercent(processedValues.filter((value) => Math.abs(value - (spec.lowerBound as number)) <= tolerance).length / processedValues.length) : null;
    const atUpperBoundPercent = hasBounds ? toPercent(processedValues.filter((value) => Math.abs(value - (spec.upperBound as number)) <= tolerance).length / processedValues.length) : null;
    const meanChangePercent = relativeChangePercent(meanBefore, meanAfter);
    const stdChangePercent = relativeChangePercent(stdBefore, stdAfter);
    return {
        column: spec.name, type: spec.type, epsilon: spec.epsilon, evaluatedCount: originalValues.length,
        level: maxLevel([levelFromPercent(meanChangePercent), levelFromPercent(stdChangePercent), levelFromPercent(errorPercentOfRange)]),
        meanBefore, meanAfter, meanChangePercent, stdBefore, stdAfter, stdChangePercent, meanAbsoluteError, errorPercentOfRange,
        atLowerBoundPercent, atUpperBoundPercent
    };
};

const evaluateCategorical = (spec: DpUtilityColumnSpec, before: string[], after: string[]): DpColumnUtility | null => {
    const originalCounts = new Map<string, number>();
    const processedCounts = new Map<string, number>();
    let unchangedCount = 0;
    let total = 0;
    for (let rowIndex = 0; rowIndex < before.length; rowIndex += 1) {
        if (before[rowIndex] === '' && after[rowIndex] === '') continue;
        total += 1;
        if (before[rowIndex] === after[rowIndex]) unchangedCount += 1;
        originalCounts.set(before[rowIndex], (originalCounts.get(before[rowIndex]) ?? 0) + 1);
        processedCounts.set(after[rowIndex], (processedCounts.get(after[rowIndex]) ?? 0) + 1);
    }
    if (total === 0) return null;
    const allValues = new Set([...originalCounts.keys(), ...processedCounts.keys()]);
    let totalVariation = 0;
    allValues.forEach((value) => { totalVariation += Math.abs((originalCounts.get(value) ?? 0) / total - (processedCounts.get(value) ?? 0) / total); });
    totalVariation /= 2;
    const unchangedPercent = toPercent(unchangedCount / total);
    // 類別欄：保持原值的比例低代表被翻成別的類別很多；以「被換掉的比例」套用同一組門檻
    return {
        column: spec.name, type: spec.type, epsilon: spec.epsilon, evaluatedCount: total,
        level: levelFromPercent(100 - unchangedPercent),
        unchangedPercent, distributionSimilarityPercent: toPercent(1 - totalVariation)
    };
};

const evaluateDatetime = (spec: DpUtilityColumnSpec, before: string[], after: string[]): DpColumnUtility | null => {
    const shifts: number[] = [];
    let earliest = Infinity;
    let latest = -Infinity;
    for (let rowIndex = 0; rowIndex < before.length; rowIndex += 1) {
        const originalTime = before[rowIndex] === '' ? NaN : Date.parse(before[rowIndex].replace(' ', 'T'));
        const processedTime = after[rowIndex] === '' ? NaN : Date.parse(after[rowIndex].replace(' ', 'T'));
        if (Number.isNaN(originalTime) || Number.isNaN(processedTime)) continue;
        shifts.push(Math.abs(processedTime - originalTime) / 86_400_000);
        earliest = Math.min(earliest, originalTime);
        latest = Math.max(latest, originalTime);
    }
    if (shifts.length === 0) return null;
    const meanShiftDays = meanOf(shifts);
    const spanDays = (latest - earliest) / 86_400_000;
    const shiftPercentOfSpan = spanDays > 0 ? toPercent(meanShiftDays / spanDays) : null;
    return {
        column: spec.name, type: spec.type, epsilon: spec.epsilon, evaluatedCount: shifts.length,
        level: levelFromPercent(shiftPercentOfSpan),
        meanShiftDays, maxShiftDays: Math.max(...shifts), shiftPercentOfSpan
    };
};

/** 以已解析的列計算（含標頭列）。列數不同（無法逐列配對）回傳 null，不顯示錯誤的數字。 */
export const computeDpUtilityFromRows = (
    originalRows: string[][], processedRows: string[][], specs: DpUtilityColumnSpec[], isSampled = false
): DpUtilityResult | null => {
    if (originalRows.length < 2 || processedRows.length < 2) return null;
    const originalHeader = originalRows[0].map(cleanName);
    const processedHeader = processedRows[0].map(cleanName);
    const rowCount = Math.min(originalRows.length, processedRows.length) - 1;
    // 抽樣時兩邊都只讀前段，列數可能一樣多；沒抽樣時列數必須相同才能逐列配對
    if (!isSampled && originalRows.length !== processedRows.length) return null;
    const columns: DpColumnUtility[] = [];
    for (const spec of specs) {
        const name = cleanName(spec.name);
        const originalIndex = originalHeader.indexOf(name);
        const processedIndex = processedHeader.indexOf(name);
        if (originalIndex < 0 || processedIndex < 0) continue;
        const before: string[] = [];
        const after: string[] = [];
        for (let rowIndex = 1; rowIndex <= rowCount; rowIndex += 1) {
            before.push(cellText(originalRows[rowIndex][originalIndex]));
            after.push(cellText(processedRows[rowIndex][processedIndex]));
        }
        const evaluated = spec.type === 'continuous' ? evaluateContinuous(spec, before, after)
            : spec.type === 'datetime' ? evaluateDatetime(spec, before, after)
                : evaluateCategorical(spec, before, after);
        if (evaluated) columns.push(evaluated);
    }
    if (columns.length === 0) return null;
    return {
        columns, evaluatedRows: rowCount, sampled: isSampled,
        largeDeviationColumns: columns.filter((columnItem) => columnItem.level === 3).map((columnItem) => columnItem.column)
    };
};

export interface DpUtilityBlobInput {
    originalCsvBlob: Blob;
    processedCsvBlob: Blob;
    columns: DpUtilityColumnSpec[];
    samplingThresholdBytes?: number;
    sampleRowLimit?: number;
}

/** 從 Blob 計算；大檔只讀前 20 萬列（兩邊都取前段，DP 不增刪列也不重排，仍可逐列配對） */
export const computeDpUtilityFromBlobs = async (input: DpUtilityBlobInput): Promise<DpUtilityResult | null> => {
    const threshold = input.samplingThresholdBytes ?? LARGE_FILE_SAMPLING_BYTES;
    const isLarge = input.originalCsvBlob.size > threshold || input.processedCsvBlob.size > threshold;
    const rowLimit = isLarge ? (input.sampleRowLimit ?? DP_UTILITY_SAMPLE_ROWS) + 1 : undefined;
    const originalRows = await readCsvBlobRows(await stripLeadingBom(input.originalCsvBlob), rowLimit);
    const processedRows = await readCsvBlobRows(await stripLeadingBom(input.processedCsvBlob), rowLimit);
    return computeDpUtilityFromRows(originalRows, processedRows, input.columns, isLarge);
};

export const DP_DEVIATION_LABELS: Record<DpDeviationLevel, string> = { 1: '小', 2: '中', 3: '大' };

const signedPercent = (value: number | null | undefined): string =>
    value === null || value === undefined || !Number.isFinite(value) ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;

/** 逐欄變化的一句話描述（Step4 卡片與合規報告共用） */
export const describeDpColumnUtility = (column: DpColumnUtility): string => {
    if (column.type === 'continuous') {
        const parts = [
            `平均 ${signedPercent(column.meanChangePercent)}、標準差 ${signedPercent(column.stdChangePercent)}`,
            column.errorPercentOfRange === null || column.errorPercentOfRange === undefined
                ? `平均誤差 ${column.meanAbsoluteError?.toFixed(2)}`
                : `平均誤差約為範圍的 ${column.errorPercentOfRange.toFixed(1)}%`
        ];
        if ((column.atLowerBoundPercent ?? 0) >= 5) parts.push(`${column.atLowerBoundPercent!.toFixed(1)}% 的值被拉到下界`);
        if ((column.atUpperBoundPercent ?? 0) >= 5) parts.push(`${column.atUpperBoundPercent!.toFixed(1)}% 的值被拉到上界`);
        return parts.join('；');
    }
    if (column.type === 'categorical') {
        return `${column.unchangedPercent?.toFixed(1)}% 保持原值；分布相似度 ${column.distributionSimilarityPercent?.toFixed(1)}%`;
    }
    return `平均位移 ${column.meanShiftDays?.toFixed(1)} 天（最大 ${column.maxShiftDays?.toFixed(1)} 天）`;
};
