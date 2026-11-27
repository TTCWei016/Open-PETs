/**
 * ============================================================================
 * 檔案名稱 (File): complianceReport.ts
 * 模組功能 (Description): 合規報告內容快照（Step4「查看與下載報告」與「歷史檢測紀錄」調閱共用）
 * ============================================================================
 * ★ 2026-10-08 使用者反映：Step4 合規報告與歷史檢測紀錄調閱的內容不一致——
 *   Step4 報告是 2026-09-23 改版後的六段式（含隱私強化處理配置、CAP、整體風險等級 L1/L2/L3、
 *   資料效用），歷史紀錄卻仍是舊版（只有三攻擊字串與「綜合殘餘風險 %」，且以 20% 判斷顏色），
 *   兩邊的小數位數、綜合風險的算法也不同。
 *   改為：運算完成時把報告需要的數值存成快照（寫入稽核紀錄、一併簽章），兩邊都用
 *   components/ComplianceReportDocument.tsx 以同一份快照繪製，內容保證相同。
 */
import type { KAnonymityFidelityResult } from './kAnonymityFidelity';
import type { CapReport, DpQualityReport, KAnonymityQualityReport } from '../api/apiService';
import { isDpBudgetExceeded } from './pipelineConfig';
import { computeOverallRiskLevel, type OverallRiskSummary } from './riskLevel';
import { getKAnonymityGeneralizationTechLabel } from './kAnonymityTechLabel';
import type { AuditLogItem, ComplianceStatus } from '../store/useAuditStore';

/** 合規報告繪製所需的稽核紀錄（Step4 尚未寫入 store 時沒有 id） */
export type ComplianceReportEntry = Omit<AuditLogItem, 'id'> & { id?: string };

/** 三攻擊／CAP 固定參數（與實際送給後端 /api/v1/risk/* 的 RISK_ATTACK_DEFAULT_PARAMS 相同） */
export interface ReportRiskAttackParams {
    n_iter: number;
    ctrl_ratio: number;
    seed: number;
    n_subset: number;
    n_repeats: number;
    overlap_ratio: number;
}

export interface ComplianceReportSnapshot {
    /** 快照格式版本 */
    version: 1;
    /** K-匿名處理參數（差分隱私時不存在） */
    kAnonymityConfig?: {
        kValue: number;
        maxSuppressionPercent: number;
        limitExceededAction: string;
        suppressionMethod: string;
        cellFillMethod: string;
        /** ★ 2026-10-28：l／t（未啟用該檢測時為 null；舊紀錄無此欄位） */
        lValue?: number | null;
        tValue?: number | null;
        /** ★ 2026-10-28：識別欄位雜湊演算法（後端品質報告回填；沒有欄位用雜湊時為 null） */
        hashAlgorithm?: string | null;
        hashSalted?: boolean | null;
    };
    /** 差分隱私參數（K-匿名時不存在）；累計值為本次執行「之後」的值，與 Step4 畫面一致 */
    dpConfig?: {
        accumulatedEpsilon: number;
        accumulatedDelta: number;
        defaultDelta: number;
    };
    riskAttackParams: ReportRiskAttackParams;
    /** 三攻擊正規化後風險（0~1）；略過時為 null */
    attackRisks: { singling: number; linkability: number; inference: number } | null;
    /** CAP 前後對比（後端回傳＋前端扣除基線）；略過時為 null */
    cap: Pick<CapReport, 'cap_before' | 'cap_after' | 'message' | 'cap_baseline_after' | 'cap_after_excess'> | null;
    /** 資料效用 */
    utility: {
        suppressionRatePercent: number | null; // K-匿名抑制率（%）
        consumedEpsilon: number | null;        // 差分隱私本次消耗 ε
        deidentifiedColumnsCount: number;      // 實際去識別欄位數
        totalColumnsCount: number;             // 總欄位數
        /** K-匿名資料實用性：指引保真度三項指標（2026-10-15 起；舊紀錄無此欄位） */
        fidelity?: { columnShapes: number; columnPairTrends: number | null; overall: number; isPassed: boolean } | null;
        /** ★ 2026-10-28：差分隱私本次消耗 δ */
        consumedDelta?: number | null;
    };
    /** ★ 2026-10-28：資料預先處理（去識別化前的清洗；沒有時為空陣列；舊紀錄無此欄位） */
    preprocessing?: { columnName: string; stepsText: string }[];
    /** ★ 2026-10-28：風險評估對象（評估欄位來源、間接識別、敏感欄位、族群條件、連結性分組）；未評估時為 null */
    riskTargets?: {
        source: 'imported' | 'derived';
        quasiIdentifiers: string[];
        sensitive: string[];
        subgroupLines: string[];
        linkability: { A: string[]; B: string[] } | null;
    } | null;
    /** ★ 2026-10-28：差分隱私各加噪欄位的 ε */
    dpColumnEpsilon?: Record<string, number>;
    /** ★ 2026-10-28：後端回傳的處理與量測說明（套用的預設值、族群筆數、降級等） */
    backendNotes?: string[];
    /** ★ 專家回饋 P-03：各項去識別化檢查分別的結果（只列使用者選用的項目；未選用的標示為未檢查，不寫成通過）；舊紀錄無此欄位 */
    deidChecks?: DeidentificationCheck[];
    /** ★ 專家回饋 P-01／P-02：結論適用範圍——已設定去識別化處理的欄位、原樣輸出的欄位、未納入風險評估的原樣輸出欄位；舊紀錄無此欄位 */
    outputScope?: OutputScope;
}

export interface BuildComplianceReportSnapshotInput {
    privacyMode: string | null | undefined;
    kValue: number;
    maxSuppressionPercent: number | null | undefined;
    limitExceededAction: string | null | undefined;
    suppressionMethod: string | null | undefined;
    cellFillMethod: string | null | undefined;
    dpAccumulatedEpsilon: number | null | undefined;
    dpAccumulatedDelta: number | null | undefined;
    dpDefaultDelta: number | null | undefined;
    riskAttackParams: ReportRiskAttackParams;
    attackRisks: { singling: number; linkability: number; inference: number } | null;
    capReport: CapReport | null | undefined;
    suppressionRatePercent: number | null | undefined;
    consumedEpsilon: number | null | undefined;
    deidentifiedColumnsCount: number;
    totalColumnsCount: number;
    fidelity?: Pick<KAnonymityFidelityResult, 'columnShapes' | 'columnPairTrends' | 'overall' | 'isPassed'> | null;
    /** ★ 2026-10-28 補充資訊（皆選填） */
    lValue?: number | null;
    tValue?: number | null;
    hashAlgorithm?: string | null;
    hashSalted?: boolean | null;
    consumedDelta?: number | null;
    preprocessing?: { columnName: string; stepsText: string }[];
    riskTargets?: ComplianceReportSnapshot['riskTargets'];
    dpColumnEpsilon?: Record<string, number>;
    backendNotes?: string[];
    /** ★ 專家回饋 P-03：各項去識別化檢查分別的結果（只列使用者選用的項目；未選用的標示為未檢查，不寫成通過）；舊紀錄無此欄位 */
    deidChecks?: DeidentificationCheck[];
    /** ★ 專家回饋 P-01／P-02：結論適用範圍——已設定去識別化處理的欄位、原樣輸出的欄位、未納入風險評估的原樣輸出欄位；舊紀錄無此欄位 */
    outputScope?: OutputScope;
}

const toFiniteOrNull = (value: unknown): number | null => {
    const numberValue = typeof value === 'number' ? value : Number(value);
    return value !== null && value !== undefined && Number.isFinite(numberValue) ? numberValue : null;
};

export const buildComplianceReportSnapshot = (input: BuildComplianceReportSnapshotInput): ComplianceReportSnapshot => {
    const isKAnonymity = (input.privacyMode || 'k-anonymity') === 'k-anonymity';
    const capReport = input.capReport;
    return {
        version: 1,
        ...(isKAnonymity
            ? {
                kAnonymityConfig: {
                    kValue: input.kValue,
                    // ★ 2026-10-28：缺值時的預設與實際送出的設定檔一致（pipelineConfig：抑制上限 ?? 20、超限行為 || allow_with_warning）；
                    //   超限行為原寫 stop_and_error，與前端 Step3 預設、後端預設皆不符
                    maxSuppressionPercent: input.maxSuppressionPercent ?? 20,
                    limitExceededAction: input.limitExceededAction || 'allow_with_warning',
                    suppressionMethod: input.suppressionMethod || 'row',
                    cellFillMethod: input.cellFillMethod || 'star',
                    lValue: toFiniteOrNull(input.lValue),
                    tValue: toFiniteOrNull(input.tValue),
                    hashAlgorithm: input.hashAlgorithm || null,
                    hashSalted: typeof input.hashSalted === 'boolean' ? input.hashSalted : null
                }
            }
            : {
                dpConfig: {
                    accumulatedEpsilon: input.dpAccumulatedEpsilon ?? 0,
                    accumulatedDelta: input.dpAccumulatedDelta ?? 0,
                    // ★ 2026-10-31：未設定全域 δ 時不送 default_delta，後端以 δ=0（純 ε）處理；原本誤顯示 1e-5
                    defaultDelta: input.dpDefaultDelta ?? 0
                }
            }),
        riskAttackParams: { ...input.riskAttackParams },
        attackRisks: input.attackRisks ? { ...input.attackRisks } : null,
        cap: capReport
            ? {
                cap_before: capReport.cap_before,
                cap_after: capReport.cap_after,
                message: capReport.message,
                ...(capReport.cap_baseline_after !== undefined ? { cap_baseline_after: capReport.cap_baseline_after } : {}),
                ...(capReport.cap_after_excess !== undefined ? { cap_after_excess: capReport.cap_after_excess } : {})
            }
            : null,
        utility: {
            suppressionRatePercent: isKAnonymity ? toFiniteOrNull(input.suppressionRatePercent) : null,
            consumedEpsilon: isKAnonymity ? null : toFiniteOrNull(input.consumedEpsilon),
            deidentifiedColumnsCount: input.deidentifiedColumnsCount,
            totalColumnsCount: input.totalColumnsCount,
            fidelity: isKAnonymity && input.fidelity
                ? { columnShapes: input.fidelity.columnShapes, columnPairTrends: input.fidelity.columnPairTrends, overall: input.fidelity.overall, isPassed: input.fidelity.isPassed }
                : null,
            consumedDelta: isKAnonymity ? null : toFiniteOrNull(input.consumedDelta)
        },
        preprocessing: input.preprocessing ? input.preprocessing.map((item) => ({ ...item })) : [],
        riskTargets: input.riskTargets ? { ...input.riskTargets, subgroupLines: [...input.riskTargets.subgroupLines] } : null,
        ...(!isKAnonymity && input.dpColumnEpsilon ? { dpColumnEpsilon: { ...input.dpColumnEpsilon } } : {}),
        ...(input.deidChecks ? { deidChecks: input.deidChecks.map((checkItem) => ({ ...checkItem })) } : {}),
        ...(input.outputScope ? { outputScope: { processedColumns: [...input.outputScope.processedColumns], rawColumns: [...input.outputScope.rawColumns], unevaluatedRawColumns: [...input.outputScope.unevaluatedRawColumns] } } : {}),
        backendNotes: (input.backendNotes || []).filter((noteText) => typeof noteText === 'string' && noteText.trim() !== '')
    };
};

/** CAP 是否有評估結果（後端以負數表示未評估） */
export const isCapEvaluated = (cap: Pick<CapReport, 'cap_before' | 'cap_after'> | null | undefined): boolean =>
    Boolean(cap && cap.cap_before >= 0 && cap.cap_after >= 0);

/** 扣除亂猜基線後的 CAP（無則 null） */
export const resolveCapExcessRisk = (cap: Pick<CapReport, 'cap_before' | 'cap_after' | 'cap_after_excess'> | null | undefined): number | null =>
    isCapEvaluated(cap) && typeof cap?.cap_after_excess === 'number' ? cap.cap_after_excess : null;

/**
 * 「能否猜出敏感資料」：只看推斷性攻擊。
 * ★ 專家回饋 P-03：CAP 是推斷風險的參考數據，不列入風險評估通過與否的判定（目前也沒有公認的處理前後下降標準），
 *   報告另列 CAP 數值並註明這一點。原本取推斷性攻擊與扣除基線後 CAP 的較高者，已改為只看推斷性攻擊。
 */
export const resolveSensitiveGuessRisk = (inferenceRisk: number | null | undefined): number | null =>
    typeof inferenceRisk === 'number' && Number.isFinite(inferenceRisk) && inferenceRisk >= 0 ? inferenceRisk : null;

/** ★ 專家回饋 P-01／P-02：這些前處理動作會把欄位改成「不再是原值」；去空白、轉型、正規化、限制範圍只是清洗，不算去識別化 */
const DEIDENTIFYING_PREPROCESS_ACTIONS: ReadonlySet<string> = new Set(['hash', 'regex_replace', 'slice', 'anchor_truncate']);

/**
 * 檢測報告與下載注意事項的結論只適用「已設定去識別化處理的欄位」。
 * - processedColumns：已設定去識別化處理（K-匿名的識別欄位、間接識別欄位；差分隱私已啟用的欄位；或前處理做了雜湊／替換／截斷）
 * - rawColumns：沒有任何去識別化處理、原樣輸出的欄位，由使用者自行確認是否為非隱私資料
 * - unevaluatedRawColumns：原樣輸出、且沒有納入再識別風險評估（不是間接識別欄位也不是敏感欄位）的欄位
 * 已被刪除的欄位（前處理「刪除整欄」、K-匿名識別欄位選「刪除」）不在輸出裡，兩邊都不列。
 */
export interface OutputScope {
    processedColumns: string[];
    rawColumns: string[];
    unevaluatedRawColumns: string[];
}

export const computeOutputScope = (input: {
    privacyMode: string | null | undefined;
    columnNames: string[];
    resolveColumnRole: (columnName: string) => { role: string; maskStrategy?: string };
    dpEnabledFieldNames: string[];
    preprocessingRules: Record<string, { action: string }[]> | null | undefined;
    /** 有納入風險評估的欄位（間接識別欄位＋敏感欄位） */
    evaluatedColumns: string[];
}): OutputScope => {
    const isDifferentialPrivacy = input.privacyMode === 'differential-privacy';
    const dpEnabledSet = new Set(input.dpEnabledFieldNames.map((fieldName) => String(fieldName ?? '').trim()));
    const evaluatedSet = new Set(input.evaluatedColumns.map((columnName) => String(columnName ?? '').trim()));
    const processedColumns: string[] = [];
    const rawColumns: string[] = [];
    for (const rawName of input.columnNames) {
        const columnName = String(rawName ?? '').trim();
        if (columnName === '') continue;
        const stepList = input.preprocessingRules ? input.preprocessingRules[columnName] : undefined;
        if (Array.isArray(stepList) && stepList.some((stepItem) => stepItem.action === 'drop_column')) continue; // 前處理已刪除
        const { role, maskStrategy } = input.resolveColumnRole(columnName);
        if (!isDifferentialPrivacy && role === 'Identifier' && maskStrategy === 'remove') continue; // K-匿名識別欄位已刪除
        const isPreprocessDeidentified = Array.isArray(stepList) && stepList.some((stepItem) => DEIDENTIFYING_PREPROCESS_ACTIONS.has(stepItem.action));
        const isDeidentified = isPreprocessDeidentified
            || (isDifferentialPrivacy ? dpEnabledSet.has(columnName) : (role === 'Identifier' || role === 'Quasi-identifier'));
        (isDeidentified ? processedColumns : rawColumns).push(columnName);
    }
    return { processedColumns, rawColumns, unevaluatedRawColumns: rawColumns.filter((columnName) => !evaluatedSet.has(columnName)) };
};

/** ★ 專家回饋 P-03：去識別化檢查的單項結果；not_selected＝使用者沒選用，未檢查（不是通過） */
export type DeidentificationCheckResult = 'passed' | 'failed' | 'not_selected';

export interface DeidentificationCheck {
    key: 'k' | 'l' | 't' | 'suppression' | 'output' | 'budget';
    result: DeidentificationCheckResult;
}

/**
 * 各項去識別化檢查分別的結果（整體結論以未通過的項目為準）。
 * - 沒選用的檢查（例如沒設定 l／t）標示為 not_selected，絕不寫成通過；
 * - 輸出筆數為 0（全被刪除或遮蔽）時，輸出檢查為未通過，k／l／t 也無從檢測，一律未通過。
 */
export const buildDeidentificationChecks = (input: {
    privacyMode: string | null | undefined;
    kReport?: KAnonymityQualityReport | null;
    dpReport?: DpQualityReport | null;
    lRequested: boolean;
    tRequested: boolean;
    maxSuppressionPercent: number;
    budgetLimitEpsilon: number;
}): DeidentificationCheck[] => {
    if (input.privacyMode === 'differential-privacy') {
        if (!input.dpReport) return [];
        return [{ key: 'budget', result: isDpBudgetExceeded(input.dpReport.consumed_epsilon, input.budgetLimitEpsilon) ? 'failed' : 'passed' }];
    }
    const report = input.kReport;
    if (!report) return [];
    const isEmptyOutput = report.output_empty === true;
    const isLChecked = report.l_checked ?? input.lRequested;
    const isTChecked = report.t_checked ?? input.tRequested;
    const toResult = (isPassed: boolean): DeidentificationCheckResult => (isPassed && !isEmptyOutput ? 'passed' : 'failed');
    return [
        { key: 'output', result: isEmptyOutput ? 'failed' : 'passed' },
        { key: 'k', result: toResult(report.k_passed !== false) },
        { key: 'l', result: isLChecked ? toResult(report.l_passed !== false) : 'not_selected' },
        { key: 't', result: isTChecked ? toResult(report.t_passed !== false) : 'not_selected' },
        { key: 'suppression', result: report.suppression_rate_percent <= input.maxSuppressionPercent ? 'passed' : 'failed' },
    ];
};

/** 整體風險等級（三個白話問題取最高），Step4 畫面、合規報告、歷史紀錄共用同一算法 */
export const computeReportOverallRisk = (
    attackRisks: { singling: number; linkability: number; inference: number } | null | undefined,
    labels: { singling: string; linkability: string; sensitive: string }
): OverallRiskSummary | null => computeOverallRiskLevel([
    { label: labels.singling, value: attackRisks?.singling },
    { label: labels.linkability, value: attackRisks?.linkability },
    { label: labels.sensitive, value: resolveSensitiveGuessRisk(attackRisks?.inference) },
]);

/**
 * ★ 2026-11-06 使用者反映：整體風險「未評估」的紀錄仍顯示「達標」，隱私保護程度無從確認。
 *   原本合規只看去識別化本身（K-匿名 is_valid／DP 預算未超出），沒納入風險評估，連風險「不通過」也算達標。
 *   改為三種結果：去識別化未達標或風險不通過＝failed；風險未評估＝unassessed；兩者皆通過才 passed。
 *   Step4 存紀錄、處理紀錄列表、報告、首頁統計都用這裡判定；非 passed 一律不提供下載。
 */
export const resolveComplianceStatus = (isProcessingValid: boolean, overallRisk: OverallRiskSummary | null): ComplianceStatus => {
    if (!isProcessingValid) return 'failed';
    if (!overallRisk) return 'unassessed';
    return overallRisk.info.level === 1 ? 'passed' : 'failed';
};

/** 舊紀錄未評估時存的整體風險文字（見 pipelineResults.ts buildPipelineAuditLogEntry） */
const LEGACY_NOT_EVALUATED_TEXT = '未評估';

/**
 * 處理紀錄的合規結果：依紀錄內容重新判定，舊紀錄（當時未納入風險評估、存成 passed）也適用。
 *   紀錄已由後端簽章，不改存的 status，只在顯示時判定。
 */
export const resolveAuditLogComplianceStatus = (entry: Pick<AuditLogItem, 'status' | 'overallRisk' | 'reportSnapshot'>): ComplianceStatus => {
    if (entry.status === 'failed') return 'failed';
    if (entry.reportSnapshot) {
        return resolveComplianceStatus(true, computeReportOverallRisk(entry.reportSnapshot.attackRisks, { singling: '', linkability: '', sensitive: '' }));
    }
    // 沒有報告快照的舊紀錄只有整體風險文字
    if (entry.status === 'unassessed' || entry.overallRisk === LEGACY_NOT_EVALUATED_TEXT) return 'unassessed';
    return entry.status;
};

/**
 * ★ 2026-10-02：ε 由多個欄位預算相加而來，浮點數誤差會讓畫面顯示 15.879999999999999 這類數字。
 *   顯示時一律四捨五入至小數點後 6 位並去掉多餘的 0（15.88、17、0.333333），不影響實際運算與送出的值。
 *   （2026-10-08 自 Step4_Result.tsx 移出，供合規報告元件共用）
 */
export const formatEpsilonForDisplay = (epsilonValue: number | string | null | undefined): string => {
    const numericEpsilonValue = Number(epsilonValue);
    if (!Number.isFinite(numericEpsilonValue)) return '0';
    return String(Number(numericEpsilonValue.toFixed(6)));
};

/** 依紀錄快照推導欄位隱私角色與套用技術（Step4 與歷史紀錄同一套規則） */
export const resolveReportColumnTechText = (
    entry: ComplianceReportEntry,
    columnName: string,
    translate: (key: string, defaultValue: string) => string
): { role: string; techText: string } => {
    const role = entry.columnRoleSnapshot?.[columnName] || 'Non-sensitive';
    let techText = translate('step4.report.tech_keep_original', '保留原文');
    const maskStrategy = entry.identifierMaskStrategySnapshot?.[columnName];
    if (role === 'Identifier') {
        // ★ 2026-10-28：識別欄位支援 刪除／雜湊／清空（舊紀錄只有 remove 與完全遮蔽）
        if (maskStrategy === 'remove') techText = translate('step4.report.tech_removed', '直接移除');
        else if (maskStrategy === 'hash') techText = translate('step4.report.tech_hashed', '雜湊（假名化）');
        else if (maskStrategy === 'clear') techText = translate('step4.report.tech_cleared', '清空值（保留欄位）');
        else techText = translate('step4.report.tech_full_masking', '完全遮蔽');
    } else if ((role === 'Sensitive' || role === 'Non-sensitive') && maskStrategy === 'remove' && entry.privacyMode === 'k-anonymity') {
        // ★ 2026-10-28：敏感／非敏感欄位選「刪除」現在會實際送到後端刪欄
        techText = translate('step4.report.tech_removed', '直接移除');
    } else if (role === 'Non-sensitive' && entry.privacyMode === 'k-anonymity' && maskStrategy && ['mask', 'partial', 'hash', 'clear'].includes(maskStrategy)) {
        // ★ 2026-10-28：非敏感欄位遮蔽
        const nonSensitiveTechLabels: Record<string, [string, string]> = {
            mask: ['step4.report.tech_mask_full', '全遮蔽'],
            partial: ['step4.report.tech_mask_partial', '部分遮蔽'],
            hash: ['step4.report.tech_hashed', '雜湊（假名化）'],
            clear: ['step4.report.tech_cleared', '清空值（保留欄位）'],
        };
        techText = translate(nonSensitiveTechLabels[maskStrategy][0], nonSensitiveTechLabels[maskStrategy][1]);
    } else if (role === 'Quasi-identifier' && entry.privacyMode === 'k-anonymity') {
        techText = getKAnonymityGeneralizationTechLabel(entry.qiGeneralizationTechSnapshot?.[columnName], translate);
    } else if (entry.privacyMode === 'differential-privacy' && (entry.dpEnabledFieldNamesSnapshot || []).includes(columnName)) {
        techText = translate('step4.report.tech_dp', '差分隱私加噪');
        // ★ 2026-10-28：列出該欄位的 ε
        const columnEpsilon = entry.reportSnapshot?.dpColumnEpsilon?.[columnName];
        if (typeof columnEpsilon === 'number') techText = `${techText}（ε = ${formatEpsilonForDisplay(columnEpsilon)}）`;
    }
    return { role, techText };
};
