/**
 * 接入示例.cjs —— seatBackrestPressure_v2.12.0.js 最小接入示例（Node / 打包后的浏览器代码写法相同）。
 * 运行：node 接入示例.cjs [坐垫原始采集CSV]
 * 不带参数时使用内置的一帧合成数据；带参数时读取上位机导出的“拟合用原始数据”CSV 的原始字节帧。
 * 注意：示例脚本自己读文件；算法 JS 本身不读写文件。
 */
'use strict';
const path = require('path');
const alg = require(path.join(__dirname, 'seatBackrestPressure_v2.12.0.js'));

// 0) 自检
const sc = alg.runSelfCheck();
console.log('版本', alg.VERSION, '来源上位机', alg.SOURCE_APPLICATION_VERSION, '自检', sc.passed ? '通过' : '失败', sc.checks.length + ' 项');

// 1) 准备一帧：raw = 1024 字节原始帧（推荐）；也可直接给 physical（原生物理矩阵）
function syntheticPhysical(type) {
  const d = alg.SENSOR_DEFINITIONS[type];
  const m = [];
  for (let r = 0; r < d.physicalRows; r++) {
    const row = [];
    for (let c = 0; c < d.physicalCols; c++) {
      const dist = Math.hypot(r - d.physicalRows / 2, c - d.physicalCols / 2);
      row.push(dist < 3 ? Math.round(150 * (1 - dist / 6)) : 0);
    }
    m.push(row);
  }
  return m;
}
function readRawFrames(csvPath) {
  const fs = require('fs');
  const lines = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  const h = lines.findIndex((l) => l.startsWith('帧序号,采集类型'));
  const header = lines[h].split(',');
  const tsCol = header.indexOf('采集时间戳（ms）');
  const ts = [];
  let i = h + 1;
  while (i < lines.length && lines[i].trim() && !lines[i].startsWith('---')) { ts.push(Number(lines[i].split(',')[tsCol])); i++; }
  const frames = [];
  let k = -1;
  for (; i < lines.length; i++) {
    if (/^--- 帧序号 #\d+ ---/.test(lines[i])) { k++; continue; }
    if (lines[i].startsWith('原始字节')) {
      const raw = [];
      for (let r = 0; r < 32; r++) raw.push(...lines[i + 2 + r].split(',').slice(1, 33).map(Number));
      frames.push({ raw, timestampMs: ts[k] });
      i += 33;
    }
  }
  return frames;
}

const type = 'endi-23x23';
const frames = process.argv[2]
  ? readRawFrames(process.argv[2]).slice(0, 100)
  : Array.from({ length: 40 }, (_, k) => ({ physical: syntheticPhysical(type), timestampMs: k * 50 }));

// 2) 实时：一个传感器一个会话，按时间顺序逐帧 update（状态机在会话内）
const session = alg.createSensorSession(type);
let last = null;
for (const f of frames) last = session.update(f);
console.log('实时最后一帧：压力', last.forceN, 'N；面积', last.areaCm2, 'cm²；平均压强',
  alg.kpaToNcm2(last.averagePressureKPa), 'N/cm²；最大压强', alg.kpaToNcm2(last.maxPressureKPa), 'N/cm²；最大格', last.maxPressureCell);
console.log('逐格统计与卡片一致：', last.pointPressureStats.avgKpa === last.averagePressureKPa && last.pointPressureStats.maxKpa === last.maxPressureKPa);
for (const r of last.regions) console.log('  区', r.index, r.mode, r.factorKind, r.forceN + ' N', r.areaCm2 + ' cm²', r.pressureKPa + ' kPa');

// 3) 对接文档 §2 逐格接口（单帧静态）：输入原生物理矩阵 → 同形物理点 kPa
const physical = last.sourcePhysical;
const map = alg.calculateDummyMatrixPressureMap(physical, type);
console.log('逐格接口：grid', map.grid, '形状', map.kpa.length + '×' + map.kpa[0].length, 'avgKpa', map.avgKpa, 'maxKpa', map.maxKpa, 'validCount', map.validCount, 'mode', map.mode);

// 4) 输入上位机 sourceMatrix（插值网格）→ 与上位机压强热力图逐格相同
const map2 = alg.calculateMatrixPressureMap(last.sourceMatrix, type);
console.log('插值网格接口：grid', map2.grid, '形状', map2.kpa.length + '×' + map2.kpa[0].length, 'avgKpa', map2.avgKpa, '= 上位机卡片', map2.hostAveragePressureKPa);
