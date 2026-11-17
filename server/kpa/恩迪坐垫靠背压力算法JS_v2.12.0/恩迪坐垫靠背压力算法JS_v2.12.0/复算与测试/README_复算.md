# 复算与测试说明

本目录用于复现 `算法JS/seatBackrestPressure_v2.12.0.js` 的构建、与上位机源码的逐帧对拍，以及 `原始数据与残差/` 中各表的生成。所有脚本只读输入文件，不改动原始数据。

## 1. 目录内容

| 路径 | 内容 |
| --- | --- |
| `上位机V2.7.110完整源码.zip` | 汽车座椅标定上位机 V2.7.110 完整源码（不含 node_modules），解压后得到 `源码/` |
| `构建与对拍/build_sbp.py` | 构建脚本：esbuild 打包上位机算法源码 → 嵌入外层包装 → 检查禁用调用 → 写出 JS 与 build.json |
| `构建与对拍/kernel_entry.ts` | 内核入口，以相对路径 `../源码/client/src/lib/` 引用上位机算法源码 |
| `构建与对拍/wrapper.template.js` | 外层包装：公开接口、`CELL_CALIBRATION`、会话、`runSelfCheck` |
| `构建与对拍/parity.ts` | 真实数据对拍：同一 CSV 逐帧送入上位机源码和交付 JS，比较全部输出 |
| `构建与对拍/parity_synthetic.ts` | 合成场景对拍：超量程、真人、砝码 + 真人、真人退出防抖、靠背超量程 |
| `数据表/make_tables.cjs` | 只调用交付 JS，生成 §5.3 原始表、逐帧载荷与读数、逐档残差统计、覆盖格推断汇总 |
| `数据表/consistency.py` | 生成跨位置一致性、位置增益分布与统计 |
| `数据表/位置增益参数.json` | 两个核心内置的连续拟合参数（c0、k、位置增益、节点坐标、σ），供 consistency.py 使用 |
| `数据表/dump_params.ts` | 从上位机源码的两个核心导出 `位置增益参数.json` |
| `数据表/make_cell_template.py` | 生成 `原始数据与残差/单格3档标定原始表_待实测模板.csv` |
| `数据表/make_checklist.py` | 生成 `交接文档/对接条款逐项核对.md/.csv/.json` |
| `数据表/make_field_xlsx.py` | 生成 `交接文档/现场验收记录.xlsx`（参数：条款核对 json、输出 xlsx） |
| `对拍结果/` | 本次交付时运行的三份对拍结果 JSON（含被测 JS 的 SHA256） |

## 2. 环境

- Node.js 20 或以上，pnpm 10（上位机 `package.json` 中 `packageManager` 为 pnpm@10.4.1）
- Python 3.9 或以上；生成 xlsx 需要 `openpyxl`
- esbuild 0.25.10、tsx 4.20.6 由上位机源码的 `pnpm install` 安装，不需要单独安装

```bash
cd 复算与测试
unzip 上位机V2.7.110完整源码.zip        # 得到 ./源码/
cd 源码 && pnpm install --frozen-lockfile && cd ..
```

以下命令都在 `复算与测试/` 下执行，`TSX=源码/node_modules/.bin/tsx`。

## 3. 复现构建（逐字节相同）

```bash
cd 构建与对拍
python3 build_sbp.py /tmp/sbp_out
sha256sum /tmp/sbp_out/seatBackrestPressure_v2.12.0.js ../../算法JS/seatBackrestPressure_v2.12.0.js
cd ..
```

两行哈希应相同：`438564a438c7c453483230907ad826f96134ef2897717d354b8be49d9cd066ed`。构建脚本会把 esbuild 的模块路径注释统一写成 `// lib/<文件>`，所以解压到任何目录构建结果都一样。`build.json` 中记录了 9 个上位机源码文件的 SHA256，可与 `源码/client/src/lib/` 下的文件逐一核对。

构建脚本对源码只做一处改动：靠背核心 `process()` 中“未传时间戳时取系统时钟”的分支在本模块里不可达（静态接口传 0，会话接口总是传调用方给的时间），替换为抛错，这样模块里不含 `Date.now`。

## 4. 与上位机逐帧对拍

```bash
J=../算法JS/seatBackrestPressure_v2.12.0.js
SEAT=../原始数据与残差/原始采集/恩迪坐垫_31位置
BACK=../原始数据与残差/原始采集/恩迪靠背_44位置
$TSX 构建与对拍/parity.ts seat     $SEAT $J /tmp/parity_seat.json
$TSX 构建与对拍/parity.ts backrest $BACK $J /tmp/parity_backrest.json
$TSX 构建与对拍/parity_synthetic.ts $SEAT $BACK $J /tmp/parity_synthetic.json
```

每份结果中 `passed` 应为 `true`、`mismatches` 为空。比较内容：总压力、总面积、平均 / 最大压强、每个接触区的力、面积、压强、识别模式与系数类别、逐格压强矩阵、热力图 ADC 矩阵、v2.11.x 兼容字段；静态逐格接口另做物理形与插值形抽样。本次交付结果（`对拍结果/`）：

| 对拍 | 帧数 | 差异 |
| --- | --- | --- |
| 坐垫真实数据（31 文件） | 6,200 帧 + 静态 124 样本 | 0 |
| 靠背真实数据（44 文件） | 8,800 帧 + 静态 176 样本 | 0 |
| 坐垫超量程 / 真人 / 砝码 + 真人 / 真人退出防抖 | 202 / 56 / 60 / 76 帧 | 0 |
| 靠背超量程 | 202 帧 | 0 |

对拍脚本会同时输出两边的单帧耗时（`timingMs`），数值和机器有关，仅供参考。

## 5. 复现数据表

```bash
mkdir -p /tmp/tables
$TSX 数据表/dump_params.ts /tmp/tables/位置增益参数.json        # 应与 数据表/位置增益参数.json 逐字节相同
node 数据表/make_tables.cjs $SEAT $BACK $J /tmp/tables
python3 数据表/consistency.py /tmp/tables/逐帧载荷与读数.csv 数据表/位置增益参数.json /tmp/tables
```

生成的文件与 `原始数据与残差/` 下同名文件逐字节相同（`consistency.json` 在交付包里改名为 `位置增益与一致性统计.json`）。真值规则见 `原始数据与残差/数据口径与未测项目.md`。

## 6. 交付前自检

```bash
node -e "const m=require('../算法JS/seatBackrestPressure_v2.12.0.js'); const r=m.runSelfCheck(); console.log(r.passed); for (const c of r.checks) console.log(c.passed, c.name)"
cd ../算法JS && node 接入示例.cjs
```

`runSelfCheck()` 7 项应全部通过，其中包括两条曲线在 ADC 0–255 全域严格单调递增。

## 7. 注意

- 交付 JS 和对拍结果都绑定在上位机 V2.7.110。上位机以后再改算法，需要重新构建并重跑第 4 节对拍，发布新的版本号，不要覆盖 2.12.0。
- 单格 3 档数据测完后，系数写入 `wrapper.template.js` 中的 `CELL_CALIBRATION`，重新构建；`runSelfCheck` 会检查每个部位 `cells` 长度等于 rows × cols。
