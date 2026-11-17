#!/usr/bin/env python3
"""生成 §5.3 单格 3 档标定原始表的待实测模板（测量列留空）。
用法：python3 make_cell_template.py <输出 csv>
行列为原生方向、行优先、左上角为原点，index = row × cols + col（与 CELL_CALIBRATION 相同）。
"""
import csv, sys

SENSORS = [("endi-23x23", 23, 23), ("new-backrest-32x25", 32, 25)]
LOADS_KPA = (2.5, 10, 20)
out = sys.argv[1]
n = 0
with open(out, "w", encoding="utf-8-sig", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["sensorType", "index", "row", "col", "load_kPa", "repeat_index", "measured_adc",
                "压头面积cm2", "施加力N", "device_id", "source_file", "timestamp_ms", "备注"])
    for st, rows, cols in SENSORS:
        for r in range(rows):
            for c in range(cols):
                for kpa in LOADS_KPA:
                    w.writerow([st, r * cols + c, r, c, kpa, 1, "", "", "", "", "", "", ""])
                    n += 1
assert n == (23 * 23 + 32 * 25) * len(LOADS_KPA) == 3987
print("rows", n)
