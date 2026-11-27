"""指認性攻擊改用「整數編碼比對」（展示站 100 萬筆逾時的修正）後，結果必須與原本逐筆字串比對完全相同。"""
import numpy as np
import pandas as pd
import pytest

from app.engines.risk.attacks.singling_out import SinglingOutAttack, _CodedFrame


def _reference_run(syn, ori, ctrl, qi_cols, n_iter, rng):
    """原本的實作（逐筆 `==` 比對），當作對照基準。"""
    match = SinglingOutAttack._match_count
    s_ori = s_ctrl = s_base = 0
    for _ in range(n_iter):
        n_query_cols = int(rng.integers(1, len(qi_cols) + 1))
        query_cols = rng.choice(qi_cols, size=n_query_cols, replace=False)
        sample_row = syn.sample(n=1, random_state=rng).iloc[0]
        query_values = {c: sample_row[c] for c in query_cols}
        if match(ori, query_values) == 1:
            s_ori += 1
        if match(ctrl, query_values) == 1:
            s_ctrl += 1
        base_values = {c: syn[c].sample(n=1, random_state=rng).iloc[0] for c in query_cols}
        if match(ori, base_values) == 1:
            s_base += 1
    return s_ori / n_iter, s_ctrl / n_iter, s_base / n_iter


def _frames(seed: int, n: int = 600):
    rng = np.random.default_rng(seed)
    base = pd.DataFrame({
        "年齡": rng.integers(18, 90, n).astype(float),
        "地區": rng.choice(["北", "中", "南", "東", None], n),
        "職業": rng.choice(["工程師", "教師", "醫師", "O'Brien", "含\"引號"], n),
        "薪資": rng.integers(1, 40, n) * 1000,
        "疾病": rng.choice(["甲", "乙", "丙"], n),
    })
    base.loc[rng.choice(n, 20, replace=False), "年齡"] = np.nan
    ori = base.iloc[: int(n * 0.8)].reset_index(drop=True)
    ctrl = base.iloc[int(n * 0.8):].reset_index(drop=True)
    syn = ori.copy()
    syn["年齡"] = (syn["年齡"] // 10 * 10).astype(object).map(lambda v: f"{v}" if pd.notna(v) else v)  # 泛化後變字串：型別與原始欄位對不上
    return syn, ori, ctrl


@pytest.mark.parametrize("seed", [1, 7, 42])
def test_coded_matching_gives_identical_scores(seed):
    syn, ori, ctrl = _frames(seed)
    qi = ["年齡", "地區", "職業", "薪資"]
    got = SinglingOutAttack().run(syn, ori, ctrl, qi, n_iter=200, rng=np.random.default_rng(seed))
    want = _reference_run(syn, ori, ctrl, qi, 200, np.random.default_rng(seed))
    assert got == want


def test_coded_frame_matches_reference_on_mixed_values():
    _, ori, _ = _frames(3)
    coded = _CodedFrame(ori)
    queries = [
        {"地區": "北"}, {"地區": None}, {"地區": np.nan}, {"年齡": np.nan}, {"年齡": 30.0}, {"年齡": 30},
        {"職業": "O'Brien"}, {"職業": "含\"引號"}, {"職業": "查無此人"}, {"年齡": "30.0"},  # 字串對不上數值欄 → 0
        {"地區": "北", "職業": "教師", "薪資": 5000}, {"地區": None, "年齡": np.nan},
    ]
    for q in queries:
        assert coded.match_count(q) == SinglingOutAttack._match_count(ori, q), q


def test_coded_frame_encodes_each_column_once():
    _, ori, _ = _frames(5)
    coded = _CodedFrame(ori)
    coded.match_count({"地區": "北"})
    first = coded._columns["地區"]
    coded.match_count({"地區": "南"})
    assert coded._columns["地區"] is first
