"""指認性攻擊（Singling out）。

問題：攻擊者能不能從資料中「單挑出唯一一個人」？
手法（規格逐條）：從 syn 抽一筆 → 隨機選部分 QI 欄位構成查詢條件 → 對 ori 檢索，
符合筆數精確等於 1 即主要攻擊成功；相同條件對 ctrl 檢索為控制攻擊。
基準攻擊＝同一套流程，但查詢值為每欄從 syn 該欄獨立隨機抽取（值真實但組合亂湊＝
無背景知識的攻擊者）；對 ori 命中唯一一筆的比例，即規格「隨機抽欄位查詢命中唯一一筆
之理論機率」之蒙地卡羅估計。

檢索以布林遮罩逐欄比對（值一律當資料比對、不拼進查詢字串），值含引號等特殊字元
也不會拋錯。
"""

import numpy as np
import pandas as pd

from app.core.cancellation import check_cancelled

from .base import AttackStrategy


class _CodedFrame:
    """把每個欄位的值預先編成整數代碼（每欄只編一次），重複比對時只比整數陣列。

    ★ 2026-11-27（展示站逾時）：原本每次查詢都拿整欄物件（字串）陣列逐筆做 `== 值`，
      100 萬筆資料 500 次迭代 × 3 種查詢要花近 4 分鐘；改成先編碼，同樣的比對只要幾秒。
      比對語意與「欄位陣列 == 值」相同：缺值自成一類；值與欄位型別對不上時視為不符；
      數值以相等判斷（1 與 1.0 視為相同）。
    """

    def __init__(self, df: pd.DataFrame):
        self._df = df
        self._columns: dict = {}

    def _column(self, col: str):
        cached = self._columns.get(col)
        if cached is None:
            codes, uniques = pd.factorize(self._df[col])  # 缺值編為 -1
            cached = (codes, {unique: index for index, unique in enumerate(uniques)})
            self._columns[col] = cached
        return cached

    def match_count(self, col_values: dict) -> int:
        """數同時滿足所有「欄位==值」條件的列數（語意同 SinglingOutAttack._match_count）。"""
        mask = None
        for col, val in col_values.items():
            codes, lookup = self._column(col)
            if pd.isna(val):
                hit = codes == -1
            else:
                code = lookup.get(val)
                if code is None:
                    return 0  # 這個值在該欄根本不存在，整個查詢不可能命中
                hit = codes == code
            mask = hit if mask is None else (mask & hit)
        return 0 if mask is None else int(mask.sum())


class SinglingOutAttack(AttackStrategy):
    """指認性攻擊模擬（無狀態）。"""

    def run(
        self,
        syn: pd.DataFrame,
        ori: pd.DataFrame,
        ctrl: pd.DataFrame,
        qi_cols: list[str],
        n_iter: int = 500,
        rng: np.random.Generator | None = None,
    ) -> tuple[float, float, float]:
        if len(syn) == 0 or len(ori) == 0:
            return 0.0, 0.0, 0.0

        # n_iter<1＝無迭代可跑（否則末行 s_ori/n_iter 會 ZeroDivisionError），回退化 0
        if n_iter < 1:
            return 0.0, 0.0, 0.0

        # 請求級亂數源由 AttackAssessor 傳入（可重現）；未傳入時不設種子，每次結果不同
        if rng is None:
            rng = np.random.default_rng()

        s_ori = 0
        s_ctrl = 0
        s_base = 0
        ori_index = _CodedFrame(ori)
        ctrl_index = _CodedFrame(ctrl)

        for _ in range(n_iter):
            check_cancelled()  # ★ TTC 2026-10-31
            # 隨機選取部分 QI 欄位構成查詢條件（主／控／基準攻擊共用同一組欄位，
            # 使三者查詢形狀相同、差異僅在「值的來源」，相減才公平）
            n_query_cols = int(rng.integers(1, len(qi_cols) + 1))
            query_cols = rng.choice(qi_cols, size=n_query_cols, replace=False)

            # 主要／控制攻擊：條件取自一筆真實 syn 紀錄（真實共現的值組合）
            sample_row = syn.sample(n=1, random_state=rng).iloc[0]
            query_values = {c: sample_row[c] for c in query_cols}
            if ori_index.match_count(query_values) == 1:
                s_ori += 1
            if ctrl_index.match_count(query_values) == 1:
                s_ctrl += 1

            # 基準攻擊：每欄的值獨立隨機抽取（不綁在同一筆紀錄上）＝值真實但組合亂湊、
            # 無背景知識；對 ori 命中唯一一筆的比例即規格「理論機率」之估計
            base_values = {
                c: syn[c].sample(n=1, random_state=rng).iloc[0] for c in query_cols
            }
            if ori_index.match_count(base_values) == 1:
                s_base += 1

        return s_ori / n_iter, s_ctrl / n_iter, s_base / n_iter

    @staticmethod
    def _match_count(df: pd.DataFrame, col_values: dict) -> int:
        """數 df 中同時滿足所有「欄位==值」條件的列數。

        以布林遮罩逐欄比對：值直接與欄位資料比對相等，不拼進查詢字串，故值含
        引號、括號等特殊字元不會破壞語法；型別對不上時安全視為不符（回 False），
        不拋例外。條件值為缺值時，條件即「該欄為缺值」（缺值自成一類）。
        """
        mask = np.ones(len(df), dtype=bool)
        for col, val in col_values.items():
            if pd.isna(val):
                mask &= df[col].isna().to_numpy()
            else:
                mask &= df[col].to_numpy() == val
        return int(mask.sum())
