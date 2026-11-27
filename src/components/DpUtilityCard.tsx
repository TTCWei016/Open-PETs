/**
 * 差分隱私「各欄位資料變化」卡片（專家回饋 P-06）。
 * 逐欄顯示處理前後的統計比較，僅供參考；不另訂通過／不通過，也不影響上方的結論與下載。
 */
import React from 'react';
import { Alert, Table, Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import { DP_DEVIATION_LABELS, describeDpColumnUtility, type DpColumnUtility, type DpDeviationLevel, type DpUtilityResult } from '../utils/dpUtility';

const LEVEL_COLORS: Record<DpDeviationLevel, string> = { 1: 'green', 2: 'orange', 3: 'red' };
const TYPE_LABELS: Record<DpColumnUtility['type'], string> = { continuous: '數值', categorical: '類別', datetime: '日期' };

export const DpUtilityCard: React.FC<{ result: DpUtilityResult }> = ({ result }) => {
    const { t: translate } = useTranslation();
    return (
        <div data-testid="dp-utility-card">
            <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                title={translate('step4.dp_utility.note', '比較處理前後每個加噪欄位，看雜訊讓資料變了多少。這只是逐欄的統計比較，僅供參考：資料能不能用取決於分析目的；欄位之間的關聯（例如年齡與生日是否互相矛盾）不在這裡檢查。偏差程度以主要指標 ≤ 5% 為小、≤ 20% 為中、> 20% 為大。')}
            />
            {result.largeDeviationColumns.length > 0 && (
                <Alert
                    type="warning"
                    showIcon
                    data-testid="dp-utility-large-deviation"
                    style={{ marginBottom: 12 }}
                    title={translate('step4.dp_utility.large_deviation', '偏差程度大的欄位：{{columns}}。請確認這些欄位的變化是否在可接受範圍內，必要時調大該欄的 ε 或調整上下限。', { columns: result.largeDeviationColumns.join('、') })}
                />
            )}
            <Table
                size="small"
                pagination={false}
                rowKey="column"
                dataSource={result.columns}
                columns={[
                    { title: translate('step4.dp_utility.col_name', '欄位'), dataIndex: 'column', width: '18%' },
                    { title: translate('step4.dp_utility.col_type', '型態'), dataIndex: 'type', width: '9%', render: (type: DpColumnUtility['type']) => TYPE_LABELS[type] },
                    { title: translate('step4.dp_utility.col_epsilon', 'ε'), dataIndex: 'epsilon', width: '8%', render: (epsilon?: number) => (epsilon === undefined ? '—' : String(Number(epsilon.toFixed(4)))) },
                    { title: translate('step4.dp_utility.col_change', '資料變化'), key: 'change', render: (_: unknown, row: DpColumnUtility) => describeDpColumnUtility(row) },
                    {
                        title: translate('step4.dp_utility.col_level', '偏差程度'), dataIndex: 'level', width: '12%',
                        render: (level: DpDeviationLevel) => <Tag color={LEVEL_COLORS[level]}>{DP_DEVIATION_LABELS[level]}</Tag>
                    },
                ]}
            />
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                {result.sampled
                    ? translate('step4.dp_utility.sampled', '資料量大，取前 {{rows}} 列計算。', { rows: result.evaluatedRows.toLocaleString() })
                    : translate('step4.dp_utility.rows', '以全部 {{rows}} 列計算。', { rows: result.evaluatedRows.toLocaleString() })}
            </div>
        </div>
    );
};
