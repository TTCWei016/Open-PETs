"""專家回饋 P-04：去識別化輸出釋出前要打亂列順序。"""
import pandas as pd

from app.core.dataset_io import shuffle_rows


def test_shuffle_keeps_content_but_breaks_order():
    df = pd.DataFrame({"卡號": [f"c{i // 5}" for i in range(500)], "序": list(range(500))})
    out = shuffle_rows(df)
    assert len(out) == len(df)
    assert sorted(out["序"]) == list(range(500))  # 內容一個不少
    assert list(out["序"]) != list(range(500))     # 順序不再與原始一致
    assert list(out.index) == list(range(500))     # 舊索引不外洩


def test_shuffle_pairs_rows_intact():
    """重排是整列一起搬，不能把同一列的欄位拆散。"""
    df = pd.DataFrame({"a": range(100), "b": [i * 10 for i in range(100)]})
    out = shuffle_rows(df)
    assert (out["b"] == out["a"] * 10).all()


def test_shuffle_is_not_reproducible():
    df = pd.DataFrame({"x": range(1000)})
    assert list(shuffle_rows(df)["x"]) != list(shuffle_rows(df)["x"])


def test_shuffle_empty_frame():
    assert len(shuffle_rows(pd.DataFrame({"x": []}))) == 0

