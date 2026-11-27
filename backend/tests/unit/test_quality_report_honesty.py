"""專家回饋 P-03：品質報告不可說謊。

- 沒設定 l／t 不可寫成「均通過」，要明講未檢測；
- 輸入有資料、輸出 0 筆不可判通過；
"""
import pandas as pd

from app.core.config import ColumnConfig, ColumnInfo
from app.engines.anonymization import run_k_anonymity


def _config(identifier_strategy=None, extra=None):
    columns = {
        "地區": ColumnInfo(role="quasi_identifier", type="categorical"),
        "疾病": ColumnInfo(role="sensitive", type="categorical"),
    }
    columns.update(extra or {})
    return ColumnConfig(columns=columns)


def _frame(rows=12):
    return pd.DataFrame({"地區": ["大安"] * rows, "疾病": ["感冒", "高血壓", "糖尿病"] * (rows // 3)})


def test_message_says_not_checked_when_l_t_not_requested():
    df_out, report = run_k_anonymity(_frame(), _config(), k=3)
    assert report.is_valid
    assert report.l_checked is False and report.t_checked is False
    assert "k 檢測均通過" in report.msg
    assert "l-diversity" in report.msg and "未檢測" in report.msg
    assert "k／l／t" not in report.msg


def test_message_lists_l_when_requested():
    df_out, report = run_k_anonymity(_frame(), _config(), k=3, l=2)
    assert report.is_valid
    assert report.l_checked is True
    assert "k／l 檢測均通過" in report.msg
    assert "t-closeness" in report.msg and "未啟用" in report.msg


def test_empty_output_is_not_valid():
    df = pd.DataFrame({"郵遞區號": ["1", "1", "1"], "年齡": [None, 30, 40]})
    config = ColumnConfig(
        columns={
            "郵遞區號": ColumnInfo(role="quasi_identifier", type="categorical"),
            "年齡": ColumnInfo(role="quasi_identifier", type="numeric"),
        }
    )
    df_out, report = run_k_anonymity(
        df, config, k=3, suppression_limit_percent=100, limit_exceeded_action="allow_with_warning"
    )
    assert len(df_out) == 0
    assert report.output_empty is True
    assert report.is_valid is False
    assert "0 筆" in report.msg
