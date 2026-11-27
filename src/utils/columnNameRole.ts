/**
 * 依欄位名稱判斷「看起來像間接識別碼」（只在使用者沒有明確設定角色時，結果預覽與報告用來推測標籤）。
 *
 * ★ 專家回饋 P-18：原本用子字串比對英文關鍵字，`marriage_cd`（婚姻代碼，使用者設為非敏感）因為名稱裡含有 `age`，
 *   被標成「間接識別碼」。英文關鍵字改為「整個單字」才算（以底線或字串頭尾為界），中文關鍵字維持子字串比對。
 */
const ENGLISH_QUASI_IDENTIFIER_WORDS = ['station', 'time', 'date', 'zip', 'age', 'gender', 'card_type'];
const CHINESE_QUASI_IDENTIFIER_KEYWORDS = ['年齡', '地區', '職業', '性別', '地址', '生日'];

export const looksLikeQuasiIdentifierByName = (columnName: string): boolean => {
    const lowerCaseName = String(columnName ?? '').trim().toLowerCase();
    if (lowerCaseName === '') return false;
    if (CHINESE_QUASI_IDENTIFIER_KEYWORDS.some((keyword) => lowerCaseName.includes(keyword))) return true;
    // 以非英數字元（底線、連字號、空白…）切成單字；card_type 是兩個單字合成的詞，另外整串比對
    const words = lowerCaseName.split(/[^a-z0-9]+/).filter(Boolean);
    const normalizedWhole = words.join('_');
    return ENGLISH_QUASI_IDENTIFIER_WORDS.some((keyword) =>
        keyword.includes('_') ? normalizedWhole === keyword || normalizedWhole.includes(`_${keyword}_`) || normalizedWhole.startsWith(`${keyword}_`) || normalizedWhole.endsWith(`_${keyword}`)
            : words.includes(keyword));
};
