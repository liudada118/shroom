/**
 * seatBackrestPressure_v2.12.0.js 与上位机 V2.7.110 源码逐帧对拍。
 * 用法：npx tsx parity.ts seat|backrest <CSV 目录> <独立JS路径> [输出 JSON]
 * 实时：每文件每 100 帧一组（与上位机回归测试相同 streamId 分组），上位机 calculateLiveSensorForce + attachEndiPointPressure，
 *       独立 JS 每组新建 createSensorSession，逐帧比较 forceN / areaCm2 / 平均压强 / 最大压强 / 各区力面积压强 /
 *       逐格压强矩阵 / sourceMatrix / 热力图 ADC 矩阵（全部严格相等）。
 * 静态：每组第 50、99 帧，上位机静态单帧路径 vs calculateMatrixPressureMap（物理形与插值形）。
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { getSensorConfig, lineInterp2x2 } from "../源码/client/src/lib/sensorConfig";
import { calculateLiveSensorForce } from "../源码/client/src/lib/sensorForce";
import { compensateAndFilterAdcMatrix, DEFAULT_ADC_COMPENSATION_SETTINGS } from "../源码/client/src/lib/adcCompensation";
import { attachEndiPointPressure, endiPointPressureMatrix } from "../源码/client/src/lib/endiPointPressure";

const which = process.argv[2];
const dir = process.argv[3];
const jsPath = path.resolve(process.argv[4]);
const outPath = process.argv[5];
const SEAT = which === "seat";
const SENSOR = SEAT ? "endi-23x23" : "new-backrest-32x25";
const cfg = getSensorConfig(SENSOR);
const NR = cfg.physicalRows, NC = cfg.physicalCols;
const req = createRequire(import.meta.url);
const alg = req(jsPath);
const files = fs.readdirSync(dir).filter(f => f.endsWith(".csv")).sort();

interface Frame { t: number; raw: number[] }
function parse(text: string): Frame[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const h = lines.findIndex(l => l.startsWith("帧序号,采集类型"));
  const header = lines[h].split(",");
  const tsCol = header.indexOf("采集时间戳（ms）") >= 0 ? header.indexOf("采集时间戳（ms）") : 4;
  const ts: number[] = [];
  let i = h + 1;
  while (i < lines.length && lines[i].trim() && !lines[i].startsWith("---")) { ts.push(Number(lines[i].split(",")[tsCol])); i++; }
  const frames: Frame[] = [];
  let k = -1; let raw: number[] = [];
  while (i < lines.length) {
    const l = lines[i];
    if (/^--- 帧序号 #\d+ ---/.test(l)) { k++; raw = []; i++; continue; }
    if (l.startsWith("原始字节")) {
      for (let r = 0; r < 32; r++) raw.push(...lines[i + 2 + r].split(",").slice(1, 33).map(Number));
      frames.push({ t: ts[k], raw });
      i += 34; continue;
    }
    i++;
  }
  return frames;
}
function decodeNative(raw: number[]): number[][] {
  const out: number[][] = [];
  for (let r = 0; r < NR; r++) {
    const row: number[] = [];
    for (let c = 0; c < NC; c++) { const idx = cfg.wireMap[r * NC + c]; row.push(idx < raw.length ? raw[idx] : 0); }
    out.push(row);
  }
  return out;
}
function sameMatrix(a: number[][] | null | undefined, b: number[][] | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  if (a.length !== b.length) return false;
  for (let r = 0; r < a.length; r++) {
    if (a[r].length !== b[r].length) return false;
    for (let c = 0; c < a[r].length; c++) if (a[r][c] !== b[r][c]) return false;
  }
  return true;
}
function zerosLike(r: number, c: number) { return Array.from({ length: r }, () => new Array(c).fill(0)); }
function agg2x2(m: number[][]) {
  const out = zerosLike(NR, NC);
  for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) out[r][c] = (m[2 * r][2 * c] + m[2 * r][2 * c + 1] + m[2 * r + 1][2 * c] + m[2 * r + 1][2 * c + 1]) / 4;
  return out;
}

const mism: Record<string, number> = {};
const samples: Record<string, unknown[]> = {};
function bad(key: string, info: unknown) { mism[key] = (mism[key] ?? 0) + 1; (samples[key] ??= []).length < 3 && samples[key].push(info); }
let nLive = 0, nLiveContact = 0, nStatic = 0, nStaticContact = 0, maxForce = 0;
const jsMs: number[] = [], hostMs: number[] = [], mapMs: number[] = [];
const modes: Record<string, number> = {};

for (const f of files) {
  const frames = parse(fs.readFileSync(path.join(dir, f), "utf8"));
  for (let s = 0, g = 0; s + 100 <= frames.length; s += 100, g++) {
    const streamId = `${f}|${g}`;
    const session = alg.createSensorSession(SENSOR);
    for (let k = 0; k < 100; k++) {
      const fr = frames[s + k];
      const native = decodeNative(fr.raw);
      const src = lineInterp2x2(native, NR, NC);
      const heat = compensateAndFilterAdcMatrix(src, SENSOR, DEFAULT_ADC_COMPENSATION_SETTINGS);
      let t0 = performance.now();
      const force = calculateLiveSensorForce(SENSOR, src, native, undefined, undefined, "fixed_load_recognition", { timestampMs: fr.t, streamId });
      attachEndiPointPressure(force, SENSOR, native, heat);
      hostMs.push(performance.now() - t0);
      t0 = performance.now();
      const js = session.update({ raw: fr.raw, timestampMs: fr.t });
      jsMs.push(performance.now() - t0);
      nLive++;
      const tag = { f, g, k };
      const hostM = endiPointPressureMatrix(force) ?? zerosLike(cfg.rows, cfg.cols);
      if (!sameMatrix(js.sourcePhysical, native)) bad("live.sourcePhysical", tag);
      if (!sameMatrix(js.sourceMatrix, src)) bad("live.sourceMatrix", tag);
      if (!sameMatrix(js.displayAdcMatrix, heat)) bad("live.displayAdcMatrix", tag);
      if (!sameMatrix(js.pointPressureKPa, hostM)) bad("live.pointPressureKPa", tag);
      const hF = force?.forceN ?? 0, hS = force?.areaCm2 ?? 0, hP = force?.averagePressureKPa ?? null;
      const hMax = force?.pointPressure?.maxPressureKPa ?? null;
      if (js.forceN !== hF) bad("live.forceN", { ...tag, js: js.forceN, host: hF });
      if (js.areaCm2 !== hS) bad("live.areaCm2", { ...tag, js: js.areaCm2, host: hS });
      if (js.averagePressureKPa !== hP) bad("live.averagePressureKPa", { ...tag, js: js.averagePressureKPa, host: hP });
      if (js.maxPressureKPa !== hMax) bad("live.maxPressureKPa", { ...tag, js: js.maxPressureKPa, host: hMax });
      const hr = force?.contactPressure?.regions ?? [];
      if (js.regions.length !== hr.length) bad("live.regionCount", { ...tag, js: js.regions.length, host: hr.length });
      else hr.forEach((r, i) => {
        const j = js.regions[i];
        if (j.forceN !== r.estimatedForceN || j.areaCm2 !== r.areaCm2 || j.pressureKPa !== r.estimatedPressureKPa) bad("live.region", { ...tag, i, js: [j.forceN, j.areaCm2, j.pressureKPa], host: [r.estimatedForceN, r.areaCm2, r.estimatedPressureKPa] });
        modes[`${j.mode}|${j.factorKind}`] = (modes[`${j.mode}|${j.factorKind}`] ?? 0) + 1;
      });
      if (JSON.stringify(js.forceMetrics) !== JSON.stringify(force)) bad("live.forceMetricsJson", tag);
      // 逐格统计与卡片一致
      if (js.pointPressureStats.validCount > 0) {
        nLiveContact++;
        if (js.pointPressureStats.avgKpa !== hP) bad("live.statsAvg=card", { ...tag, stats: js.pointPressureStats.avgKpa, card: hP });
        if (js.pointPressureStats.maxKpa !== hMax) bad("live.statsMax=card", { ...tag, stats: js.pointPressureStats.maxKpa, card: hMax });
      }
      if (hF > maxForce) maxForce = hF;
      // 静态逐格接口抽样
      if (k === 50 || k === 99) {
        const sForce = calculateLiveSensorForce(SENSOR, src, native, undefined, undefined, "fixed_load_recognition", undefined);
        attachEndiPointPressure(sForce, SENSOR, native, heat);
        const sM = endiPointPressureMatrix(sForce) ?? zerosLike(cfg.rows, cfg.cols);
        t0 = performance.now();
        const mp = alg.calculateMatrixPressureMap(native, SENSOR);
        mapMs.push(performance.now() - t0);
        const mi = alg.calculateMatrixPressureMap(src, SENSOR);
        nStatic++;
        if (!sameMatrix(mi.kpa, sM)) bad("static.interpolatedKpa", tag);
        const expPhys = agg2x2(sM);
        if (!sameMatrix(mp.kpa, expPhys)) bad("static.physicalKpa", tag);
        if (mi.forceN !== (sForce?.forceN ?? 0) || mi.areaCm2 !== (sForce?.areaCm2 ?? 0)) bad("static.forceArea", { ...tag, js: [mi.forceN, mi.areaCm2], host: [sForce?.forceN, sForce?.areaCm2] });
        if (mi.validCount > 0) {
          nStaticContact++;
          if (mi.avgKpa !== (sForce?.averagePressureKPa ?? null)) bad("static.avg=card", { ...tag, js: mi.avgKpa, host: sForce?.averagePressureKPa });
          if (mi.maxKpa !== (sForce?.pointPressure?.maxPressureKPa ?? null)) bad("static.max=card", { ...tag, js: mi.maxKpa, host: sForce?.pointPressure?.maxPressureKPa });
        }
        let sumP = 0, sumI = 0;
        for (const row of mp.kpa) for (const v of row) sumP += v;
        for (const row of mi.kpa) for (const v of row) sumI += v;
        if (Math.abs(sumP * 4 - sumI) > 1e-6) bad("static.physicalForceEquivalent", { ...tag, sumP, sumI });
        const fr2 = alg.calculateSensorFrame({ raw: fr.raw, timestampMs: fr.t }, SENSOR);
        if (!sameMatrix(fr2.pointPressureKPa, sM) || fr2.forceN !== (sForce?.forceN ?? 0)) bad("static.calculateSensorFrame", tag);
      }
    }
  }
}
const pct = (v: number[], q: number) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))]; };
const report = {
  sensorType: SENSOR, jsFile: path.basename(jsPath), jsSha256: createHash("sha256").update(fs.readFileSync(jsPath)).digest("hex"), jsVersion: alg.VERSION, sourceApplicationVersion: alg.SOURCE_APPLICATION_VERSION,
  files: files.length, liveFrames: nLive, liveContactFrames: nLiveContact, staticSamples: nStatic, staticContactSamples: nStaticContact,
  maxForceN: maxForce, mismatches: mism, samples, regionModeCounts: modes,
  timingMs: {
    hostLive: { p50: pct(hostMs, 0.5), p95: pct(hostMs, 0.95) },
    jsLive: { p50: pct(jsMs, 0.5), p95: pct(jsMs, 0.95), max: Math.max(...jsMs) },
    jsMapPhysical: { p50: pct(mapMs, 0.5), p95: pct(mapMs, 0.95), max: Math.max(...mapMs) },
  },
  passed: Object.keys(mism).length === 0 && nLive > 0,
};
if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, samples: undefined }, null, 1));
