/**
 * make_tables.cjs —— 由原始采集 CSV 与交付的 seatBackrestPressure_v2.12.0.js 生成交接数据表（对接文档 §5.3 / §4.2 / §10）。
 * 用法：node make_tables.cjs <坐垫CSV目录> <靠背CSV目录> <seatBackrestPressure_v2.12.0.js> <输出目录>
 *
 * 载荷口径（与采集规程一致）：每个文件 = 1 个放置位置 × 2 轮；每轮 100 帧 = 1–5 块各 20 帧（叠放，每块 1.625 kg，
 * 底面直径 9 cm、面积 63.62 cm²）；每档第 11–20 帧为放稳帧。真值力 = 块数 × 1.625 × 9.8 N；
 * 覆盖格压强 load_kPa = 真值力 / 63.62 cm² × 10（按砝码实际接触底面计算，不是全传感器平摊）。
 * 覆盖格为推断：每轮放稳帧原始 ADC 加权质心 ± 45 mm（砝码底面半径）内的物理点。采集时未记录放置坐标。
 * measured_adc = 原始字节经 wireMap 解码后的原生物理 ADC（未补偿、未插值）。
 * 本脚本只读写数据文件；被测 JS 本身不做文件 IO。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const [seatDir, backDir, jsPath, outDir] = process.argv.slice(2);
if (!seatDir || !backDir || !jsPath || !outDir) {
  console.error('用法：node make_tables.cjs <坐垫CSV目录> <靠背CSV目录> <JS路径> <输出目录>');
  process.exit(2);
}
const alg = require(path.resolve(jsPath));
fs.mkdirSync(outDir, { recursive: true });

const G = 9.8, BLOCK_KG = 1.625, FOOT_CM2 = 63.62, FOOT_R_MM = 45;
const BLOCK_N = BLOCK_KG * G;
const kpaOf = (n) => (n * BLOCK_N / FOOT_CM2) * 10;

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const h = lines.findIndex((l) => l.startsWith('帧序号,采集类型'));
  if (h < 0) throw new Error('找不到帧元数据表头');
  const header = lines[h].split(',');
  let tsCol = header.indexOf('采集时间戳（ms）'); if (tsCol < 0) tsCol = 4;
  const ts = [];
  let i = h + 1;
  while (i < lines.length && lines[i].trim() && !lines[i].startsWith('---')) { ts.push(Number(lines[i].split(',')[tsCol])); i++; }
  const frames = [];
  let k = -1, raw = [];
  while (i < lines.length) {
    const l = lines[i];
    if (/^--- 帧序号 #\d+ ---/.test(l)) { k++; raw = []; i++; continue; }
    if (l.startsWith('原始字节')) {
      for (let r = 0; r < 32; r++) raw.push(...lines[i + 2 + r].split(',').slice(1, 33).map(Number));
      frames.push({ t: ts[k], raw });
      i += 34; continue;
    }
    i++;
  }
  return frames;
}

const q = (v, d) => (v == null || !isFinite(v) ? '' : Number(v.toFixed(d)));
function csvLine(arr) { return arr.map((v) => (typeof v === 'string' && /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v)).join(',') + '\n'; }
function pct(a, b) { return ((a - b) / b) * 100; }
function quant(sorted, p) { if (!sorted.length) return null; const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1)); return sorted[i]; }

const stats = {};
function addStat(key, v) { (stats[key] ??= []).push(v); }

const cellOut = {}, covOut = fs.createWriteStream(path.join(outDir, '砝码覆盖格推断汇总.csv'));
covOut.write('\uFEFF' + csvLine(['sensorType', 'source_file', 'round', 'centroid_row_mm', 'centroid_col_mm', 'centroid_row', 'centroid_col', 'covered_cells', 'covered_cell_list(row:col)', 'adc_share_inside_footprint', 'footprint_partly_outside_sensor', 'coverage_basis']));
const frameOut = fs.createWriteStream(path.join(outDir, '逐帧载荷与读数.csv'));
frameOut.write('\uFEFF' + csvLine(['sensorType', 'source_file', 'frame_index', 'timestamp_ms', 'round', 'blocks', 'stable_frame', 'true_force_N', 'true_contact_area_cm2', 'true_contact_kPa',
  'js_force_N', 'js_area_cm2', 'js_avg_kPa', 'js_max_kPa', 'js_regions', 'js_mode', 'js_fit_force_N', 'raw_adc_sum', 'raw_adc_peak', 'force_error_pct', 'fit_error_pct']));

let totalCellRows = 0;
const fileIndex = [];
for (const [type, dir, label] of [['endi-23x23', seatDir, '坐垫'], ['new-backrest-32x25', backDir, '靠背']]) {
  const def = alg.SENSOR_DEFINITIONS[type];
  const R = def.physicalRows, C = def.physicalCols, [pr, pc] = def.physicalPitchMm;
  const out = fs.createWriteStream(path.join(outDir, label + '_砝码覆盖格原始表.csv'));
  out.write('\uFEFF' + csvLine(['sensorType', 'row', 'col', 'load_kPa', 'measured_adc', 'repeat_index', 'source_file', 'round', 'blocks', 'sample_index', 'frame_index', 'timestamp_ms', 'cell_distance_mm', 'coverage_basis']));
  cellOut[type] = 0;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.csv')).sort();
  for (const f of files) {
    const frames = parseCsv(fs.readFileSync(path.join(dir, f), 'utf8'));
    fileIndex.push({ sensorType: type, file: f, frames: frames.length });
    for (let s = 0, g = 0; s + 100 <= frames.length; s += 100, g++) {
      const session = alg.createSensorSession(type);
      const phys = [];
      for (let k = 0; k < 100; k++) {
        const fr = frames[s + k];
        const res = session.update({ raw: fr.raw, timestampMs: fr.t });
        const p = res.sourcePhysical;
        phys.push(p);
        const n = Math.floor(k / 20) + 1, stable = k % 20 >= 10;
        const trueN = n * BLOCK_N;
        let sum = 0, peak = 0;
        for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { sum += p[r][c]; if (p[r][c] > peak) peak = p[r][c]; }
        let fit = 0; const modes = new Set();
        for (const rg of res.regions) { fit += (rg.diagnostics.fitMassKg || 0) * G; if (rg.mode) modes.add(rg.mode); }
        const fe = pct(res.forceN, trueN), fte = pct(fit, trueN);
        frameOut.write(csvLine([type, f, s + k, fr.t, g + 1, n, stable ? 1 : 0, q(trueN, 4), FOOT_CM2, q(kpaOf(n), 4),
          res.forceN, res.areaCm2, res.averagePressureKPa ?? '', res.maxPressureKPa ?? '', res.regions.length, [...modes].join('/'), q(fit, 3), sum, peak, q(fe, 3), q(fte, 3)]));
        if (stable) {
          addStat(type + '|force|' + n, fe); addStat(type + '|fit|' + n, fte);
          addStat(type + '|area|' + n, pct(res.areaCm2, FOOT_CM2));
        }
      }
      // 覆盖格推断：本轮全部放稳帧原始 ADC 求和后的加权质心（mm，原生方向）
      let w = 0, wy = 0, wx = 0;
      for (let k = 0; k < 100; k++) if (k % 20 >= 10) {
        const p = phys[k];
        for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { const v = p[r][c]; if (v > 0) { w += v; wy += v * r * pr; wx += v * c * pc; } }
      }
      if (w <= 0) continue;
      const cy = wy / w, cx = wx / w;
      const covered = [];
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const d = Math.hypot(r * pr - cy, c * pc - cx);
        if (d <= FOOT_R_MM) covered.push([r, c, d]);
      }
      const outside = cy - FOOT_R_MM < -pr / 2 || cx - FOOT_R_MM < -pc / 2 || cy + FOOT_R_MM > (R - 0.5) * pr || cx + FOOT_R_MM > (C - 0.5) * pc;
      let inside = 0, all = 0;
      for (let k = 0; k < 100; k++) if (k % 20 >= 10) {
        const p = phys[k];
        for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) all += p[r][c];
        for (const [r, c] of covered) inside += p[r][c];
      }
      covOut.write(csvLine([type, f, g + 1, q(cy, 2), q(cx, 2), q(cy / pr, 3), q(cx / pc, 3), covered.length, covered.map(([r, c]) => r + ':' + c).join(' '), q(inside / all, 4), outside ? 1 : 0, 'inferred_adc_centroid_r45mm']));
      for (let k = 0; k < 100; k++) if (k % 20 >= 10) {
        const n = Math.floor(k / 20) + 1, fr = frames[s + k], p = phys[k];
        for (const [r, c, d] of covered) {
          out.write(csvLine([type, r, c, q(kpaOf(n), 4), p[r][c], g + 1, f, g + 1, n, (k % 20) - 9, s + k, fr.t, q(d, 2), 'inferred_adc_centroid_r45mm']));
          cellOut[type]++; totalCellRows++;
        }
      }
    }
  }
  await_end(out);
}
function await_end(stream) { stream.end(); }
covOut.end(); frameOut.end();

// 逐档残差统计
const summary = { generatedBy: 'make_tables.cjs', jsVersion: alg.VERSION, sourceApplicationVersion: alg.SOURCE_APPLICATION_VERSION,
  stableFramesRule: '每档第 11–20 帧', blockN: BLOCK_N, footprintCm2: FOOT_CM2, cellRows: cellOut, levels: [] };
for (const type of ['endi-23x23', 'new-backrest-32x25']) {
  for (const kind of ['force', 'fit', 'area']) {
    const allv = [];
    for (let n = 1; n <= 5; n++) {
      const v = (stats[type + '|' + kind + '|' + n] || []).slice();
      allv.push(...v);
      const abs = v.map(Math.abs).sort((a, b) => a - b);
      summary.levels.push({ sensorType: type, kind, blocks: n, trueForceN: q(n * BLOCK_N, 3), frames: v.length,
        meanSignedPct: q(v.reduce((a, b) => a + b, 0) / v.length, 3), meanAbsPct: q(abs.reduce((a, b) => a + b, 0) / abs.length, 3),
        p95AbsPct: q(quant(abs, 0.95), 3), maxAbsPct: q(abs[abs.length - 1], 3), within10PctShare: q(abs.filter((x) => x <= 10).length / abs.length, 4) });
    }
    const abs = allv.map(Math.abs).sort((a, b) => a - b);
    summary.levels.push({ sensorType: type, kind, blocks: 'all', frames: allv.length,
      meanSignedPct: q(allv.reduce((a, b) => a + b, 0) / allv.length, 3), meanAbsPct: q(abs.reduce((a, b) => a + b, 0) / abs.length, 3),
      p95AbsPct: q(quant(abs, 0.95), 3), maxAbsPct: q(abs[abs.length - 1], 3), within10PctShare: q(abs.filter((x) => x <= 10).length / abs.length, 4) });
  }
}
summary.files = fileIndex;
fs.writeFileSync(path.join(outDir, '逐档残差统计.json'), JSON.stringify(summary, null, 1));
let lv = '\uFEFF' + csvLine(['sensorType', 'kind', 'blocks', 'trueForceN', 'frames', 'meanSignedPct', 'meanAbsPct', 'p95AbsPct', 'maxAbsPct', 'within10PctShare']);
for (const r of summary.levels) lv += csvLine([r.sensorType, r.kind, r.blocks, r.trueForceN ?? '', r.frames, r.meanSignedPct, r.meanAbsPct, r.p95AbsPct, r.maxAbsPct, r.within10PctShare]);
fs.writeFileSync(path.join(outDir, '逐档残差统计.csv'), lv);
console.log(JSON.stringify({ cellRows: cellOut, files: fileIndex.length }));
