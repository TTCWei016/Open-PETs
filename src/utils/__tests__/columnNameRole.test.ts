/**
 * 專家回饋 P-18：欄名含 age 的 marriage_cd 不可被標成間接識別碼；真正的年齡、日期、站名等欄位仍要認得。
 */
import { describe, expect, it } from 'vitest';
import { looksLikeQuasiIdentifierByName } from '../columnNameRole';

describe('looksLikeQuasiIdentifierByName', () => {
    it.each(['marriage_cd', 'message', 'usage', 'image_url', 'stage', 'language', 'percentage'])('名稱只是「含有」關鍵字的子字串，不算：%s', (name) => {
        expect(looksLikeQuasiIdentifierByName(name)).toBe(false);
    });

    it.each(['age', 'Age', 'age_group', 'person_age', 'birth_date', 'date', 'station_id', 'start_time', 'zip', 'zip_code', 'gender', 'card_type', 'user card_type'])('整個單字相符才算：%s', (name) => {
        expect(looksLikeQuasiIdentifierByName(name)).toBe(true);
    });

    it.each(['年齡', '地區', '職業', '性別', '地址', '生日', '出生日期_生日'])('中文關鍵字維持子字串比對：%s', (name) => {
        expect(looksLikeQuasiIdentifierByName(name)).toBe(true);
    });

    it('空字串與無關名稱不算', () => {
        expect(looksLikeQuasiIdentifierByName('')).toBe(false);
        expect(looksLikeQuasiIdentifierByName('disability_lv')).toBe(false);
        expect(looksLikeQuasiIdentifierByName('is_in_active_fault')).toBe(false);
    });
});
