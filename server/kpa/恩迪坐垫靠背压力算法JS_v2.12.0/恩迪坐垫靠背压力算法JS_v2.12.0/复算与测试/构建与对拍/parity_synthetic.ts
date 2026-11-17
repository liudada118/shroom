/**
 * seatBackrestPressure_v2.12.0.js 与上位机 V2.7.110 源码：合成场景逐帧对拍（覆盖真实标定数据中没有的分支）。
 * 场景与上位机专项测试 tests/endi_over_human_e2e.ts 相同的构造方法：
 *   S1 坐垫砝码超量程（真实 1–5 块 → ×1.15 → 回 5 块）、S2 坐垫真人加载、S5 坐垫砝码 + 真人、
 *   S6 坐垫真人退出防抖（面积 < 600 cm² 持续 / 短暂）、B1 靠背砝码超量程（面积 ×2）。
 * 用法：npx tsx parity_synthetic.ts <坐垫CSV目录> <靠背CSV目录> <独立JS> [输出 JSON]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { getSensorConfig, lineInterp2x2 } from "../源码/client/src/lib/sensorConfig";
import { calculateLiveSensorForce } from "../源码/client/src/lib/sensorForce";
import { compensateAndFilterAdcMatrix, DEFAULT_ADC_COMPENSATION_SETTINGS } from "../源码/client/src/lib/adcCompensation";
import { attachEndiPointPressure, endiPointPressureMatrix } from "../源码/client/src/lib/endiPointPressure";

type M = number[][];
const [seatDir, backDir, jsArg, outPath] = process.argv.slice(2);
const alg = createRequire(import.meta.url)(path.resolve(jsArg));
const DT = 50;

function parsePhys(text: string, R: number, C: number): { t: number; phys: M }[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const h = lines.findIndex(l => l.startsWith("帧序号,采集类型"));
  const tsCol = lines[h].split(",").indexOf("采集时间戳（ms）");
  const ts: number[] = []; let i = h + 1;
  while (i < lines.length && lines[i].trim() && !lines[i].startsWith("---")) { ts.push(Number(lines[i].split(",")[tsCol])); i++; }
  const frames: { t: number; phys: M }[] = []; let k = -1;
  while (i < lines.length) {
    const l = lines[i];
    if (/^--- 帧序号 #\d+ ---/.test(l)) { k++; i++; continue; }
    if (l.startsWith("插值前原始物理矩阵") && k >= 0) {
      const phys: M = [];
      for (let r = 0; r < R; r++) phys.push(lines[i + 2 + r].split(",").slice(1, C + 1).map(Number));
      frames.push({ t: ts[k], phys }); i += R + 2; continue;
    }
    i++;
  }
  return frames;
}
function algToNative(a: M): M {
  const n = a.length;
  const out: M = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let R = 0; R < n; R++) for (let C = 0; C < n; C++) out[R][C] = a[C][n - 1 - R];
  return out;
}
const transpose = (a: M): M => a[0].map((_, c) => a.map(row => row[c]));
const zeros = (r = 23, c = r): M => Array.from({ length: r }, () => new Array<number>(c).fill(0));
const scaleAdc = (a: M, s: number): M => a.map(r => r.map(v => (v > 0 ? Math.min(255, Math.max(1, Math.round(v * s))) : 0)));
function humanBlob(cr: number, cc: number, scale: number, base: M = zeros()): M {
  const a = base.map(r => r.slice());
  const lobes = [[cr, cc - 3.2], [cr, cc + 3.2]];
  for (let r = 0; r < 23; r++) for (let c = 0; c < 23; c++) {
    let v = 0;
    for (const [lr, lc] of lobes) v = Math.max(v, 150 * Math.exp(-(((r - lr) / 3.6) ** 2 + ((c - lc) / 2.8) ** 2) / 1.6));
    v *= scale;
    if (v >= 6) a[r][c] = Math.max(a[r][c], Math.min(255, Math.round(v)));
  }
  return a;
}
function sameMatrix(a: M | null | undefined, b: M | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  if (a.length !== b.length) return false;
  for (let r = 0; r < a.length; r++) { if (a[r].length !== b[r].length) return false; for (let c = 0; c < a[r].length; c++) if (a[r][c] !== b[r][c]) return false; }
  return true;
}

const report: Record<string, unknown> = { jsFile: path.basename(jsArg), jsSha256: createHash("sha256").update(fs.readFileSync(path.resolve(jsArg))).digest("hex"), jsVersion: alg.VERSION, sourceApplicationVersion: alg.SOURCE_APPLICATION_VERSION, scenarios: {} as Record<string, unknown> };
let allOk = true;
function run(name: string, sensor: "endi-23x23" | "new-backrest-32x25", nativeSeq: M[]) {
  const cfg = getSensorConfig(sensor);
  const session = alg.createSensorSession(sensor);
  const mism: Record<string, number> = {};
  const kinds: Record<string, number> = {};
  let maxF = 0, maxS = 0, humanFrames = 0, overFrames = 0, peakGainFrames = 0;
  const bad = (k: string) => { mism[k] = (mism[k] ?? 0) + 1; };
  nativeSeq.forEach((native, k) => {
    const t = 100000 + k * DT;
    const src = lineInterp2x2(native, cfg.physicalRows, cfg.physicalCols);
    const heat = compensateAndFilterAdcMatrix(src, sensor, DEFAULT_ADC_COMPENSATION_SETTINGS);
    const force = calculateLiveSensorForce(sensor, src, native, undefined, undefined, "fixed_load_recognition", { timestampMs: t, streamId: name });
    attachEndiPointPressure(force, sensor, native, heat);
    const js = session.update({ physical: native, timestampMs: t });
    const hostM = endiPointPressureMatrix(force) ?? zeros(cfg.rows, cfg.cols);
    if (!sameMatrix(js.pointPressureKPa, hostM)) bad("pointPressureKPa");
    if (!sameMatrix(js.displayAdcMatrix, heat)) bad("displayAdcMatrix");
    if (js.forceN !== (force?.forceN ?? 0)) bad("forceN");
    if (js.areaCm2 !== (force?.areaCm2 ?? 0)) bad("areaCm2");
    if (js.averagePressureKPa !== (force?.averagePressureKPa ?? null)) bad("averagePressureKPa");
    if (js.maxPressureKPa !== (force?.pointPressure?.maxPressureKPa ?? null)) bad("maxPressureKPa");
    if (JSON.stringify(js.forceMetrics) !== JSON.stringify(force)) bad("forceMetricsJson");
    if (js.pointPressureStats.validCount > 0) {
      if (js.pointPressureStats.avgKpa !== js.averagePressureKPa) bad("statsAvg=card");
      if (js.pointPressureStats.maxKpa !== js.maxPressureKPa) bad("statsMax=card");
    }
    for (const r of js.regions) kinds[r.factorKind] = (kinds[r.factorKind] ?? 0) + 1;
    if (js.regions.some((r: any) => r.factorKind === "human")) humanFrames++;
    if (js.regions.some((r: any) => r.factorKind === "over_range" || r.overRange)) overFrames++;
    if ((force?.pointPressure as any)?.regions?.some((r: any) => r.peakGainApplied > 1)) peakGainFrames++;
    maxF = Math.max(maxF, js.forceN); maxS = Math.max(maxS, js.areaCm2);
  });
  const ok = Object.keys(mism).length === 0;
  allOk = allOk && ok;
  (report.scenarios as Record<string, unknown>)[name] = { sensorType: sensor, frames: nativeSeq.length, mismatches: mism, factorKindRegionFrames: kinds, humanFrames, overRangeFrames: overFrames, humanPeakGainFrames: peakGainFrames, maxForceN: maxF, maxAreaCm2: maxS, passed: ok };
}

const seatFiles = fs.readdirSync(seatDir).filter(f => f.endsWith(".csv")).sort();
const backFiles = fs.readdirSync(backDir).filter(f => f.endsWith(".csv")).sort();
const seat0 = parsePhys(fs.readFileSync(path.join(seatDir, seatFiles[0]), "utf8"), 23, 23);
// S1 坐垫砝码超量程
{
  const fr = seat0; const seq: M[] = [];
  for (let k = 0; k < 100; k++) seq.push(fr[k].phys);
  const hold5 = (k: number) => fr[80 + (k % 20)].phys;
  for (let k = 0; k < 8; k++) seq.push(scaleAdc(hold5(k), 1 + 0.15 * (k + 1) / 8));
  for (let k = 0; k < 40; k++) seq.push(scaleAdc(hold5(k), 1.15));
  for (let k = 0; k < 8; k++) seq.push(scaleAdc(hold5(k), 1.15 - 0.15 * (k + 1) / 8));
  for (let k = 0; k < 40; k++) seq.push(hold5(k));
  for (let k = 0; k < 6; k++) seq.push(zeros());
  run("S1_坐垫砝码超量程", "endi-23x23", seq.map(algToNative));
}
// S2 坐垫真人加载
{
  const seq: M[] = [];
  for (let k = 0; k < 20; k++) seq.push(humanBlob(11, 11, 0.05 + 0.95 * (k + 1) / 20));
  for (let k = 0; k < 30; k++) seq.push(humanBlob(11, 11, 1 + 0.01 * Math.sin(k)));
  for (let k = 0; k < 6; k++) seq.push(zeros());
  run("S2_坐垫真人", "endi-23x23", seq.map(algToNative));
}
// S5 坐垫砝码 + 真人
{
  let chosen: M[] | null = null;
  for (const f of seatFiles) {
    const x = parsePhys(fs.readFileSync(path.join(seatDir, f), "utf8"), 23, 23);
    const hold = x.slice(10, 20).map(y => y.phys);
    let w = 0, sr = 0, sc = 0;
    for (let r = 0; r < 23; r++) for (let c = 0; c < 23; c++) { const v = hold[0][r][c]; w += v; sr += v * r; sc += v * c; }
    if (sr / w < 5 && (sc / w < 5 || sc / w > 17)) { chosen = hold; break; }
  }
  if (!chosen) chosen = seat0.slice(10, 20).map(y => y.phys);
  let w = 0, sr = 0, sc = 0;
  for (let r = 0; r < 23; r++) for (let c = 0; c < 23; c++) { const v = chosen[0][r][c]; w += v; sr += v * r; sc += v * c; }
  const hr = sr / w < 11 ? 15.5 : 7.5, hc = sc / w < 11 ? 14 : 8;
  const seq: M[] = [];
  for (let k = 0; k < 20; k++) seq.push(chosen[k % 10]);
  for (let k = 0; k < 40; k++) seq.push(humanBlob(hr, hc, Math.min(1, (k + 1) / 8), chosen[k % 10]));
  run("S5_坐垫砝码加真人", "endi-23x23", seq.map(algToNative));
}
// S6 坐垫真人退出防抖
{
  const seq: M[] = [];
  for (let k = 0; k < 20; k++) seq.push(humanBlob(11, 11, 1));
  for (let k = 0; k < 30; k++) seq.push(humanBlob(11, 11, 0.7));
  for (let k = 0; k < 4; k++) seq.push(zeros());
  for (let k = 0; k < 10; k++) seq.push(humanBlob(11, 11, 1));
  for (let k = 0; k < 2; k++) seq.push(humanBlob(11, 11, 0.7));
  for (let k = 0; k < 10; k++) seq.push(humanBlob(11, 11, 1));
  run("S6_坐垫真人退出防抖", "endi-23x23", seq.map(algToNative));
}
// B1 靠背砝码超量程
{
  const fr = parsePhys(fs.readFileSync(path.join(backDir, backFiles[0]), "utf8"), 25, 32);
  const seq: M[] = [];
  for (let k = 0; k < 100; k++) seq.push(fr[k].phys);
  const hold5 = (k: number) => fr[80 + (k % 20)].phys;
  for (let k = 0; k < 8; k++) seq.push(scaleAdc(hold5(k), 1 + 0.15 * (k + 1) / 8));
  for (let k = 0; k < 40; k++) seq.push(scaleAdc(hold5(k), 1.15));
  for (let k = 0; k < 8; k++) seq.push(scaleAdc(hold5(k), 1.15 - 0.15 * (k + 1) / 8));
  for (let k = 0; k < 40; k++) seq.push(hold5(k));
  for (let k = 0; k < 6; k++) seq.push(zeros(25, 32));
  run("B1_靠背砝码超量程", "new-backrest-32x25", seq.map(transpose));
}
report.passed = allOk;
if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
