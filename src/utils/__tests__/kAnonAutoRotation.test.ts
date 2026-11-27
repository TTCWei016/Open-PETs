/**
 * 專家回饋 P-10：K-匿名沒有指定敏感欄位時，比照差分隱私輪流以類別型欄位為敏感欄位評估，不再略過。
 */
import { describe, expect, it } from 'vitest';
import {
    resolveKAnonymityRiskColumns, resolveKAnonymityAutoRotationCandidates, buildKAnonymityAutoRotationRiskColumnsForCandidate
} from '../riskAssessment';

const fields = [
    { name: '姓名', role: 'Identifier', type: 'string', maskStrategy: 'hash' },
    { name: '年齡', role: 'Quasi-identifier', type: 'numeric', maskStrategy: 'none' },
    { name: '地區', role: 'Quasi-identifier', type: 'categorical', maskStrategy: 'none' },
    { name: '職業', role: 'Non-sensitive', type: 'categorical', maskStrategy: 'none' },
    { name: '薪資', role: 'Non-sensitive', type: 'numeric', maskStrategy: 'none' },
    { name: '備註', role: 'Non-sensitive', type: 'categorical', maskStrategy: 'remove' },
];
const processedColumnNames = fields.map((field) => field.name);
const riskColumnsMap = resolveKAnonymityRiskColumns({ processedColumnNames, kAnonymityFields: fields, resolveFallbackUiRole: () => 'Non-sensitive' }).riskColumnsMap;

describe('resolveKAnonymityAutoRotationCandidates', () => {
    it('候選＝間接識別或非敏感、型別為類別的欄位；不含識別欄位、數值欄、已選刪除的欄位', () => {
        const candidates = resolveKAnonymityAutoRotationCandidates({ processedColumnNames, kAnonymityFields: fields, riskColumnsMap });
        expect(candidates).toEqual(['地區', '職業']);
    });

    it('只有 1 個間接識別、且它自己就是候選：本輪沒有攻擊面，不列入', () => {
        const oneQiFields = fields.filter((field) => field.name !== '年齡');
        const oneQiMap = resolveKAnonymityRiskColumns({ processedColumnNames: oneQiFields.map((f) => f.name), kAnonymityFields: oneQiFields, resolveFallbackUiRole: () => 'Non-sensitive' }).riskColumnsMap;
        const candidates = resolveKAnonymityAutoRotationCandidates({ processedColumnNames: oneQiFields.map((f) => f.name), kAnonymityFields: oneQiFields, riskColumnsMap: oneQiMap });
        expect(candidates).toEqual(['職業']); // 地區是唯一的間接識別，當敏感就沒有攻擊面
    });

    it('沒有任何間接識別：沒有候選', () => {
        const noQiFields = fields.filter((field) => field.role !== 'Quasi-identifier');
        const names = noQiFields.map((f) => f.name);
        const map = resolveKAnonymityRiskColumns({ processedColumnNames: names, kAnonymityFields: noQiFields, resolveFallbackUiRole: () => 'Non-sensitive' }).riskColumnsMap;
        expect(resolveKAnonymityAutoRotationCandidates({ processedColumnNames: names, kAnonymityFields: noQiFields, riskColumnsMap: map })).toEqual([]);
    });
});

describe('buildKAnonymityAutoRotationRiskColumnsForCandidate', () => {
    it('本輪候選為敏感欄位（類別型），其餘間接識別照舊', () => {
        expect(buildKAnonymityAutoRotationRiskColumnsForCandidate(riskColumnsMap, '職業')).toEqual({
            年齡: { role: 'quasi_identifier', type: 'numeric' },
            地區: { role: 'quasi_identifier', type: 'categorical' },
            職業: { role: 'sensitive', type: 'categorical' },
        });
    });

    it('候選原本就是間接識別：本輪改當敏感，不會同時出現兩個角色', () => {
        expect(buildKAnonymityAutoRotationRiskColumnsForCandidate(riskColumnsMap, '地區')).toEqual({
            年齡: { role: 'quasi_identifier', type: 'numeric' },
            地區: { role: 'sensitive', type: 'categorical' },
        });
    });
});
