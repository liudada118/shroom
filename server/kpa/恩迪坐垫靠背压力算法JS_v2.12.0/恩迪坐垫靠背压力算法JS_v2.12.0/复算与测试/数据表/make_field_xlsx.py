#!/usr/bin/env python3
"""make_field_xlsx.py —— 生成《现场验收记录.xlsx》。
用法：python3 make_field_xlsx.py <对接条款逐项核对.json> <输出 xlsx>
表格只给出计划与记录格式；空白单元格表示尚未实测，不表示已测。
"""
import json, sys
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

checklist_json, out_path = sys.argv[1], sys.argv[2]
items = json.load(open(checklist_json, encoding="utf-8"))

BLOCK_KG = 1.625
G = 9.8
FOOT_CM2 = 63.62
SENSORS = [("endi-23x23", "坐垫", 23, 23), ("new-backrest-32x25", "靠背", 32, 25)]

HEAD_FILL = PatternFill("solid", fgColor="1F4E78")
HEAD_FONT = Font(bold=True, color="FFFFFF")
NOTE_FONT = Font(italic=True, color="595959")
PLAN_FILL = PatternFill("solid", fgColor="F2F2F2")
INPUT_FILL = PatternFill("solid", fgColor="FFF2CC")
THIN = Side(style="thin", color="BFBFBF")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
WRAP = Alignment(wrap_text=True, vertical="top")

wb = Workbook()
wb.remove(wb.active)


def sheet(title, note, headers, widths, input_cols):
    """建表：第 1 行说明，第 2 行表头，第 3 行起数据。input_cols 为需要现场填写的列（黄色）。"""
    ws = wb.create_sheet(title)
    ws.cell(row=1, column=1, value=note).font = NOTE_FONT
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(headers))
    ws.row_dimensions[1].height = 48
    ws.cell(row=1, column=1).alignment = WRAP
    for j, h in enumerate(headers, 1):
        c = ws.cell(row=2, column=j, value=h)
        c.fill, c.font, c.border = HEAD_FILL, HEAD_FONT, BORDER
        c.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")
        ws.column_dimensions[get_column_letter(j)].width = widths[j - 1]
    ws.row_dimensions[2].height = 32
    ws.freeze_panes = "A3"
    ws._input_cols = set(input_cols)
    ws._ncols = len(headers)
    return ws


def add_row(ws, values):
    r = ws.max_row + 1
    for j in range(1, ws._ncols + 1):
        v = values[j - 1] if j - 1 < len(values) else None
        c = ws.cell(row=r, column=j, value=v)
        c.border = BORDER
        c.fill = INPUT_FILL if j in ws._input_cols else PLAN_FILL
    return r


# ---- 1. 交接签收 ----
ws = sheet("交接签收", "交付对象：seatBackrestPressure_v2.12.0.js（源自上位机 V2.7.110）。本表各页的空白单元格表示尚未实测，不表示已测或合格。黄色列由现场填写，灰色列为计划值或公式。",
           ["项目", "版本", "文件或记录", "交付人", "接收人", "日期", "结论", "备注"],
           [16, 22, 34, 12, 12, 14, 14, 40], [4, 5, 6, 7, 8])
add_row(ws, ["恩迪坐垫 / 靠背压力算法 JS", "2.12.0（上位机 V2.7.110）", "本文件夹与 ZIP（SHA256SUMS.txt）", None, None, None, None, "现场表格空白不表示已测"])
add_row(ws, ["对接条款逐项核对", "44 条", "交接文档/对接条款逐项核对.md", None, None, None, None, None])
add_row(ws, ["现场实测（本表 3–8 页）", "待测", "本表", None, None, None, None, "测完后由交付方据此填写 CELL_CALIBRATION 并发布新版本"])

# ---- 2. 对接条款 ----
ws = sheet("对接条款", "与 交接文档/对接条款逐项核对.md 相同。现场复核后在“现场复核结论”列填写。",
           ["id", "章节", "对接文档要求", "状态", "本次交付的证据与说明", "现场复核结论", "复核人", "日期"],
           [7, 12, 48, 16, 70, 16, 10, 12], [6, 7, 8])
for it in items:
    r = add_row(ws, [it["id"], it["section"], it["requirement"], it["status"], it["evidence"]])
    for j in (3, 5):
        ws.cell(row=r, column=j).alignment = WRAP
dv = DataValidation(type="list", formula1='"通过,不通过,待定"', allow_blank=True)
ws.add_data_validation(dv)
dv.add(f"F3:F{ws.max_row}")

# ---- 3. 低压段实测 ----
ws = sheet("低压段实测", "对接文档 §4.1。现有最低实测为 1 块砝码 = 2.503 kPa，以下为外推。每部位至少 5 个位置，每档 3 次。施加力 N = load_kPa × 压头面积 cm² ÷ 10（公式）；用 63.62 cm² 砝码底面时 0.5 kPa 只需 3.18 N（0.325 kg）。读数取放稳后的 JS 输出 avgKpa（同一接触区）。",
           ["sensorType", "部位", "位置编号", "row", "col", "load_kPa", "repeat_index", "压头面积cm²", "施加力N", "measured_adc（区内均值）", "JS avgKpa", "偏差%", "device_id", "source_file", "结论"],
           [20, 6, 8, 6, 6, 9, 8, 10, 9, 12, 10, 8, 10, 30, 10], [3, 4, 5, 8, 10, 11, 13, 14, 15])
for st, part, _, _ in SENSORS:
    for pos in range(1, 6):
        for kpa in (0.5, 1.0, 1.5, 2.0):
            for rep in (1, 2, 3):
                r = add_row(ws, [st, part, pos, None, None, kpa, rep, FOOT_CM2])
                ws.cell(row=r, column=9, value=f"=IF(H{r}=\"\",\"\",ROUND(F{r}*H{r}/10,3))")
                ws.cell(row=r, column=12, value=f"=IF(K{r}=\"\",\"\",ROUND((K{r}-F{r})/F{r}*100,2))")

# ---- 4. 单格3档标定 ----
ws = sheet("单格3档标定", "对接文档 §5.1–5.3。小压头只压单个物理点（建议直径 ≤ 15 mm；物理点距 20 mm，靠背行方向 26 mm）。每点 2.5 / 10 / 20 kPa 三档；至少 2 档。row、col 为原生方向、行优先、左上角为原点，index = row × cols + col。拟合 ADC' = a × ADC + b 后，留一档检验残差。测完的 a、b 填入 CELL_CALIBRATION（标定失败的格填 null）。",
           ["sensorType", "index", "row", "col", "load_kPa", "repeat_index", "压头面积cm²", "施加力N", "measured_adc", "a", "b", "predicted_kPa", "residual_kPa", "device_id", "source_file"],
           [20, 7, 6, 6, 9, 8, 10, 9, 11, 8, 8, 11, 11, 10, 30], [6, 7, 9, 10, 11, 12, 13, 14, 15])
for st, _, rows, cols in SENSORS:
    for rr in range(rows):
        for cc in range(cols):
            for kpa in (2.5, 10, 20):
                r = add_row(ws, [st, rr * cols + cc, rr, cc, kpa, 1])
                ws.cell(row=r, column=8, value=f"=IF(G{r}=\"\",\"\",ROUND(E{r}*G{r}/10,3))")

# ---- 5. 跨部位一致性 ----
ws = sheet("跨部位一致性", "对接文档 §10-1。同一组砝码依次压坐垫、靠背各位置，读数互相误差应 < 10%。标准力 = 块数 × 1.625 kg × 9.8。现有数据（同一砝码压不同位置）的结果见 原始数据与残差/跨位置一致性.csv。",
           ["sensorType", "部位", "位置编号", "块数", "标准力N", "JS 显示力N", "误差%", "同块数各位置极差%", "device_id", "source_file", "结论"],
           [20, 6, 8, 6, 9, 10, 8, 14, 10, 30, 10], [3, 6, 8, 9, 10, 11])
for st, part, _, _ in SENSORS:
    for pos in range(1, 6):
        for n in (1, 3, 5):
            r = add_row(ws, [st, part, pos, n])
            ws.cell(row=r, column=5, value=f"=ROUND(D{r}*{BLOCK_KG}*{G},3)")
            ws.cell(row=r, column=7, value=f"=IF(F{r}=\"\",\"\",ROUND((F{r}-E{r})/E{r}*100,2))")

# ---- 6. 硬币压头轮廓 ----
ws = sheet("硬币压头轮廓", "对接文档 §10-2。硬币大小压头（20–25 mm）压在角点和中部，保存热力图截图与原始采集文件，看能否辨认轮廓边界。",
           ["sensorType", "device_id", "位置（角点/中部）", "压头直径mm", "预期row", "预期col", "实际row", "实际col", "轮廓可辨（是/否）", "截图文件", "原始ADC文件", "结论"],
           [20, 10, 14, 10, 8, 8, 8, 8, 12, 24, 28, 10], [2, 4, 5, 6, 7, 8, 9, 10, 11, 12])
for st, _, rows, cols in SENSORS:
    for name, rr, cc in (("左上角", 1, 1), ("右上角", 1, cols - 2), ("中部", rows // 2, cols // 2), ("左下角", rows - 2, 1), ("右下角", rows - 2, cols - 2)):
        add_row(ws, [st, None, name, None, rr, cc])

# ---- 7. 均布加载 ----
ws = sheet("均布加载", "对接文档 §10-3。整块均布加载，统计有压强格子的标准差 / 均值，应 < 8%，且标定后明显下降。kPa 取 JS 输出的 kpa 数组中正值格。",
           ["sensorType", "device_id", "标准载荷kPa", "标定前/后", "有效格数", "均值kPa", "标准差kPa", "CV%", "source_file", "结论"],
           [20, 10, 12, 10, 10, 10, 10, 8, 30, 10], [2, 3, 5, 6, 7, 9, 10])
for st, _, _, _ in SENSORS:
    for phase in ("标定前", "标定后"):
        for rep in (1, 2, 3):
            r = add_row(ws, [st, None, None, phase])
            ws.cell(row=r, column=8, value=f"=IF(OR(F{r}=\"\",G{r}=\"\"),\"\",ROUND(G{r}/F{r}*100,2))")

# ---- 8. 同批多台差异 ----
ws = sheet("同批多台差异", "对接文档 §9。同批至少 3 台，按相同位置和块数采集。相对批次均值偏差超过 ±20% 时改为每台标定（CELL_CALIBRATION 按设备号独立发布）。",
           ["sensorType", "device_id", "位置编号", "块数", "标准力N", "JS 显示力N", "JS 连续拟合力N", "批次均值N", "相对批次均值偏差%", "source_file", "结论"],
           [20, 10, 8, 6, 9, 10, 12, 10, 14, 30, 10], [2, 3, 6, 7, 8, 10, 11])
for st, _, _, _ in SENSORS:
    for dev in ("台1", "台2", "台3"):
        for pos in (1, 2, 3):
            for n in (1, 3, 5):
                r = add_row(ws, [st, dev, pos, n])
                ws.cell(row=r, column=5, value=f"=ROUND(D{r}*{BLOCK_KG}*{G},3)")
                ws.cell(row=r, column=9, value=f"=IF(OR(G{r}=\"\",H{r}=\"\"),\"\",ROUND((G{r}-H{r})/H{r}*100,2))")

wb.save(out_path)
print({w.title: w.max_row - 2 for w in wb.worksheets})
