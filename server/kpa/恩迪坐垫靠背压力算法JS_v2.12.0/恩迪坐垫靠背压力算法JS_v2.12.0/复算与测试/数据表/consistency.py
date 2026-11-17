#!/usr/bin/env python3
"""consistency.py —— 对接文档 §3（a 分布判据）与 §10-1（同一砝码跨部位一致性）的现有数据适配统计。

用法：python3 consistency.py <逐帧载荷与读数.csv> <params.json> <输出目录>
  逐帧载荷与读数.csv：make_tables.cjs 用交付 JS 逐帧回放生成。
  params.json：交付 JS 内联的坐垫 31 位置 / 靠背 44 节点位置增益（与 SEAT_CALIBRATION / BACKREST_CALIBRATION 同值）。
输出：跨位置一致性.csv、位置增益分布.csv、consistency.json。

口径：
  - 只用放稳帧（stable_frame = 1，每档第 11–20 帧）。
  - 先求每个位置文件、每个块数的读数均值，再看不同位置之间的极差：(max − min) / 各位置均值的平均。
  - js_force_N = 交付 JS 最终输出（标准档识别）；js_fit_force_N = 同一帧的连续拟合力（未知载荷走这条）。
  - 位置增益 g 是“位置级”响应倍率（核心按砝码中心插值），不是逐格 a[i]；只作 §3 判据的参考。
"""
import csv, json, os, statistics as st, sys
from collections import defaultdict

frames_csv, params_json, out_dir = sys.argv[1:4]
os.makedirs(out_dir, exist_ok=True)
rows = list(csv.DictReader(open(frames_csv, encoding='utf-8-sig')))
TYPES = ['endi-23x23', 'new-backrest-32x25']
NAMES = {'endi-23x23': '坐垫', 'new-backrest-32x25': '靠背'}

pos_means = {}  # (type, col, blocks) -> {file: mean}
for t in TYPES:
    for col in ('js_force_N', 'js_fit_force_N'):
        for n in range(1, 6):
            d = defaultdict(list)
            for r in rows:
                if r['sensorType'] == t and r['stable_frame'] == '1' and int(r['blocks']) == n:
                    d[r['source_file']].append(float(r[col]))
            pos_means[(t, col, n)] = {f: st.mean(v) for f, v in d.items()}

out = []
for t in TYPES:
    for col, label in (('js_force_N', '最终输出（标准档识别）'), ('js_fit_force_N', '连续拟合（未知载荷路径）')):
        for n in range(1, 6):
            m = pos_means[(t, col, n)]
            vals = list(m.values())
            true_n = n * 1.625 * 9.8
            mean = st.mean(vals)
            out.append({
                'sensorType': t, '部位': NAMES[t], '读数': label, 'blocks': n, 'trueForceN': round(true_n, 3),
                'positions': len(vals), 'meanN': round(mean, 3), 'minN': round(min(vals), 3), 'maxN': round(max(vals), 3),
                'spreadPct': round(100 * (max(vals) - min(vals)) / mean, 2),
                'cvPct': round(100 * st.pstdev(vals) / mean, 2),
                'maxDevFromTruePct': round(100 * max(abs(v - true_n) for v in vals) / true_n, 2),
                'pass_lt10pct_spread': (max(vals) - min(vals)) / mean < 0.10,
            })
# 坐垫 vs 靠背：同块数、两部位位置均值的平均之差
cross = []
for col, label in (('js_force_N', '最终输出（标准档识别）'), ('js_fit_force_N', '连续拟合（未知载荷路径）')):
    for n in range(1, 6):
        a = st.mean(pos_means[('endi-23x23', col, n)].values())
        b = st.mean(pos_means[('new-backrest-32x25', col, n)].values())
        cross.append({'读数': label, 'blocks': n, 'seatMeanN': round(a, 3), 'backrestMeanN': round(b, 3),
                      'diffPct': round(100 * abs(a - b) / ((a + b) / 2), 2)})

with open(os.path.join(out_dir, '跨位置一致性.csv'), 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
    w.writeheader(); w.writerows(out)
    f.write('\n')
    w2 = csv.DictWriter(f, fieldnames=list(cross[0].keys()))
    w2.writeheader(); w2.writerows(cross)

p = json.load(open(params_json))
gain_rows, gain_stats = [], {}
for key, t in (('seat', 'endi-23x23'), ('back', 'new-backrest-32x25')):
    fit = p[key]['fit'] if 'fit' in p[key] else p[key]
    g = fit['gains']
    vals = []
    if key == 'seat':
        nodes = fit.get('nodes') or [None] * len(g)
        for i, (gv, nd) in enumerate(zip(g, nodes)):
            vals.append(gv)
            gain_rows.append({'sensorType': t, 'index': i, 'node_row': (nd[0] if nd else ''), 'node_col': (nd[1] if nd else ''),
                              'gain': gv, 'node_unit': '算法方向插值格（46×46）'})
    else:
        for i, (r, c, gv) in enumerate(g):
            vals.append(gv)
            gain_rows.append({'sensorType': t, 'index': i, 'node_row': r, 'node_col': c, 'gain': gv,
                              'node_unit': '算法方向物理点（25×32）'})
    med = st.median(vals); mean = st.mean(vals)
    gain_stats[t] = {'n': len(vals), 'median': round(med, 4), 'mean': round(mean, 4),
                     'cvPct': round(100 * st.pstdev(vals) / mean, 2), 'min': round(min(vals), 4), 'max': round(max(vals), 4),
                     'minVsMedianPct': round(100 * (min(vals) / med - 1), 1), 'maxVsMedianPct': round(100 * (max(vals) / med - 1), 1)}
meds = [gain_stats[t]['median'] for t in TYPES]
gain_stats['medianRangePct'] = round(100 * (max(meds) - min(meds)) / min(meds), 2)
with open(os.path.join(out_dir, '位置增益分布.csv'), 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(gain_rows[0].keys()))
    w.writeheader(); w.writerows(gain_rows)

json.dump({'crossPosition': out, 'seatVsBackrest': cross, 'positionGain': gain_stats},
          open(os.path.join(out_dir, 'consistency.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for r in out:
    print(r['部位'], r['读数'], r['blocks'], '块 位置', r['positions'], '极差 %.2f%%' % r['spreadPct'], 'CV %.2f%%' % r['cvPct'])
for r in cross:
    print('坐垫vs靠背', r['读数'], r['blocks'], '块 差 %.2f%%' % r['diffPct'])
print(json.dumps(gain_stats, ensure_ascii=False))
