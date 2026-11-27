"""欄位類動作：刪除整欄（drop_column）。

與 drop_nulls（丟棄「列」）相對：這個動作是把指定的整個欄位從資料裡拿掉。
典型用途是去識別化之前先移除姓名、身分證號這類直接識別欄位——差分隱私模式本身不負責
刪欄位，使用者在前處理就能先處理掉（專家回饋 P-01）。
"""

from typing import Any

import pandas as pd

from .base import PreprocessAction, reject_unknown_params


class DropColumn(PreprocessAction):
    """刪除整欄：指定的那一欄從輸出裡消失，其他欄位與列數都不變。

    無參數——沒有可調的東西，多寫的參數一律擋下。
    刪掉的欄位之後不能再被引用（清單上排在它後面的動作找不到這一欄），
    這件事由 PreprocessValidator 在開跑前就擋下，不會跑到一半才出錯。
    """

    name = "drop_column"

    def __init__(self, params: dict[str, Any]) -> None:
        reject_unknown_params(self.name, params, ())

    def apply(self, df: pd.DataFrame, column: str) -> pd.DataFrame:
        # 引擎在非 inplace 時已先複製一份，這裡直接就地刪除，省掉再複製一次整份資料。
        df.drop(columns=[column], inplace=True)
        return df
