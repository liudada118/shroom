import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createServer } from '../client/node_modules/vite/dist/node/index.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const datasetPath = process.env.MANNEQUIN_PREVIEW_DATASET
// A local fixture only: reading an explicitly supplied export never opens the database.
const datasetFrames = datasetPath ? (() => {
  const XLSX = require('xlsx')
  const workbook = XLSX.readFile(path.resolve(datasetPath))
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' })
  const headers = rows.shift() || []
  const dataColumn = part => headers.findIndex(value => String(value).startsWith(`${part}压强数据`))
  const definitions = [['foot', '下身', 1536], ['jacket', '上身', 1296], ['leftHand', '左臂', 144], ['rightHand', '右臂', 144]]
  const columns = definitions.map(([key, part, size]) => ({ key, part, size, index: dataColumn(part) }))
  if (columns.some(column => column.index < 0)) throw new Error('预览数据需要下身、上身、左臂、右臂压强数据列')
  if (columns.some(column => !String(headers[column.index]).includes('N/cm'))) throw new Error('预览数据压强列必须使用 N/cm²')
  return rows.filter(row => row[0] !== '').map((row, frameIndex) => {
    const pressure = {}
    for (const { key, part, size, index } of columns) {
      const values = JSON.parse(String(row[index]))
      if (!Array.isArray(values) || values.length !== size || values.some(value => !Number.isFinite(Number(value)))) {
        throw new Error(`预览第 ${frameIndex + 1} 帧${part}压强矩阵尺寸或数值无效`)
      }
      pressure[key] = values.map(value => Math.max(0, Number(value)) * 10)
    }
    pressure.leftFoot = []
    pressure.rightFoot = []
    for (let row = 0; row < 64; row++) {
      pressure.leftFoot.push(...pressure.foot.slice(row * 24, row * 24 + 12))
      pressure.rightFoot.push(...pressure.foot.slice(row * 24 + 12, row * 24 + 24))
    }
    return { frame: Number(row[0]) || frameIndex + 1, seconds: Number(row[1]) || 0, pressure }
  })
})() : []
if (datasetPath && !datasetFrames.length) throw new Error('预览数据没有有效帧')
const fixtureId = '\0mannequin-render-fixture'
const fixture = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import ThreeHumanPoint from '/src/components/three/ThreeHumanPoint.js';
import NumThres from '/src/components/three/NumThres.js';
import { useEquipStore } from '/src/store/equipStore.js';
import { buildMannequinSensorLayout } from '/src/util/mannequinSensorLayout.js';
import { getRestoredVisualSettingValue, loadVisualSettingValue } from '/src/util/visualSettingStorage.js';
import SecondTitle from '/src/components/title/SecondTitle.js';
import { pageContext } from '/src/page/test/Test.js';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import '/src/index.css';
import '/src/components/title/index.scss';
const datasetFrames = ${JSON.stringify(datasetFrames)};
const datasetMode = datasetFrames.length > 0;
const controlsMode = datasetMode || new URLSearchParams(location.search).has('controls');
const armsMode = new URLSearchParams(location.search).has('arms');
const legsMode = new URLSearchParams(location.search).has('legs');
const legEdgesMode = new URLSearchParams(location.search).has('legEdges');
const contrastMode = new URLSearchParams(location.search).has('contrast');
const mosaicMode = new URLSearchParams(location.search).has('mosaic');
const legEdgeMode = new URLSearchParams(location.search).has('legEdge');
if (controlsMode) {
  document.body.classList.add('with-color-controls');
  document.documentElement.style.fontSize = '12px';
  const fixtureStyle = document.createElement('style');
  fixtureStyle.textContent = '.with-color-controls #fixture-controls{display:none}.with-color-controls #fixture-status{top:auto;bottom:10px}.fixture-view-switch{position:fixed;left:12px;top:12px;z-index:1000;display:flex;gap:6px}.fixture-view-switch button,.fixture-dataset-controls button,.fixture-dataset-controls select{padding:8px 12px;color:#fff;background:#17212f;border:1px solid #576579;border-radius:4px;cursor:pointer}.fixture-view-switch button[aria-pressed=true],.fixture-dataset-controls button[aria-pressed=true]{background:#007bff}.fixture-dataset-controls{position:fixed;left:12px;top:56px;z-index:1000;display:flex;gap:6px;align-items:center;color:#e3edf7;font-size:12px}';
  document.head.append(fixtureStyle);
  i18n.use(initReactI18next).init({ lng: 'zh', fallbackLng: 'zh', interpolation: { escapeValue: false }, resources: { zh: { translation: {
    blur: '图像润滑', colorAdj: '颜色调节', denoise: '噪点消除', heightAdj: '大小调节',
    adjust: '可视化调节', restore: '恢复默认值', zeroPre: '预压力置零', cancelZero: '取消置零',
    select: '框选工具', ruler: '量尺工具', magnifier: '放大镜', currentDataMax: '当前最大值',
    autoColorAdj: '自动调节', heatmapColorBands: '色阶比例', colorBandTotal: '合计',
    heatmapColorBands2D: '2D 色阶比例', heatmapColorBands3D: '3D 色阶比例',
    colorBandIndependentHint: '仅调整当前视图；其余色段按比例分配，2D 与 3D 分别保存。',
    mannequinAutoColorHint: '按头部、背部、左右臂、左右腿分别自动调节；颜色调节仍可控制整体强弱。',
    colorBandPreview: '压强色阶预览', colorBandHint: '调整某段后，其余段按比例分配；仅改变配色，不影响压强数值。',
    colorBandBlueCyan: '蓝→青', colorBandCyanGreen: '青→绿', colorBandGreenYellow: '绿→黄',
    colorBandYellowOrange: '黄→橙', colorBandOrangeRed: '橙→红', resetColorBands: '重置色阶',
  } } } });
}
const archive = await fetch('/model/mannequin_sensor_layout_637.json').then(r => r.json());
const sensors = buildMannequinSensorLayout(archive);
const empty = () => ({ jacket: new Array(1296).fill(0), leftHand: new Array(144).fill(0), rightHand: new Array(144).fill(0), leftFoot: new Array(768).fill(0), rightFoot: new Array(768).fill(0) });
const metricData = { current: { pressure: empty() } };
const numericData = { current: { ...empty(), jacket: Array.from({ length: 1296 }, (_, i) => Math.round((i % 24) / 23 * 202) / 10) } };
let datasetFrameIndex = 0;
function applyDatasetFrame(index) {
  datasetFrameIndex = Math.max(0, Math.min(datasetFrames.length - 1, Number(index) || 0));
  const frame = datasetFrames[datasetFrameIndex];
  metricData.current = { pressure: frame.pressure };
  numericData.current = frame.pressure;
  useEquipStore.getState().setMetricStatus({ adc: {}, pressure: frame.pressure, force: {} });
  document.getElementById('fixture-status').textContent = '真实导出数据 · 第 ' + frame.frame + ' / ' + datasetFrames.length + ' 帧 · ' + frame.seconds.toFixed(3) + ' s · 下身峰值 ' + (Math.max(...frame.pressure.foot) / 10).toFixed(2) + ' N/cm² · 2D/3D 共用同一帧，不连接设备或数据库';
}
if (contrastMode) {
  numericData.current.jacket.fill(0);
  for (let row = 16; row <= 37; row++) for (let col = 6; col <= 17; col++) {
    numericData.current.jacket[row * 24 + col] = Math.round((0.1 + (col - 6) / 11 * 20.1) * 10) / 10;
  }
  for (let row = 10; row <= 13; row++) for (let col = 4; col <= 7; col++) numericData.current.jacket[row * 24 + col] = 0.5;
}
if (armsMode) {
  // Fixed 2D matrix anchors, independent of the 3D layout mapping under test.
  for (const key of ['leftHand', 'rightHand']) {
    for (const [row, col, pressure] of [[0, 0, 2], [0, 34, 8], [2, 0, 14], [2, 34, 20]]) {
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        numericData.current[key][(row + dy) * 36 + col + dx] = pressure;
      }
    }
  }
}
const component = React.createRef();
const restoredSettings = getRestoredVisualSettingValue('endi');
useEquipStore.setState({ settingValue: datasetMode ? { ...restoredSettings, autoColor: 0, autoColor3D: 0 } : controlsMode ? loadVisualSettingValue('endi', restoredSettings) : restoredSettings });
if (datasetMode) applyDatasetFrame(0);
function activateMosaic(useDefaults = false) {
  const pressure = empty();
  // Fixed canonical 2D coordinates, independent of the archived 3D sampling map.
  for (let row = 14; row <= 24; row++) {
    const first = row < 17 ? 5 : 4;
    for (let col = first; col <= 9; col++) pressure.jacket[row * 24 + col] = row >= 22 ? 2.1 : 1.7;
  }
  for (let row = 17; row <= 28; row++) {
    const first = row < 20 ? 18 : row > 25 ? 15 : 16;
    const last = row < 23 ? 21 : 20;
    for (let col = first; col <= last; col++) {
      pressure.jacket[row * 24 + col] = Math.round((2.4 + 0.8 * (1 - Math.abs(row - 23) / 8)) * 10) / 10;
    }
  }
  for (let row = 4; row <= 38; row++) {
    const first = row < 16 ? 0 : row < 28 ? 0 : 2;
    const last = row < 16 ? 7 : row < 28 ? 11 : 7;
    for (let col = first; col <= last; col++) {
      pressure.leftFoot[row * 12 + col] = row < 15 ? 0.8 : row < 24 ? 1.1 : 1.7;
    }
  }
  pressure.leftFoot[18 * 12 + 10] = 3.2;
  pressure.leftFoot[18 * 12 + 11] = 2.5;
  for (let col = 2; col <= 5; col++) pressure.leftFoot[16 * 12 + col] = 0;
  for (let row = 30; row <= 34; row++) pressure.leftFoot[row * 12 + 4] = 0;
  pressure.foot = Array.from({ length: 1536 }, (_, index) => {
    const row = Math.floor(index / 24), col = index % 24;
    return pressure[col < 12 ? 'leftFoot' : 'rightFoot'][row * 12 + col % 12];
  });
  metricData.current = { pressure };
  numericData.current = pressure;
  const settingValue = useDefaults ? { ...restoredSettings } : {
    ...restoredSettings, gauss: 2.3, color: 3.8, colorRange2D: 3.8, height: 150.1,
    autoColor: 0, autoColor3D: 0, colorBandRatios: [20, 20, 20, 20, 20],
  };
  useEquipStore.setState({ settingValue });
  useEquipStore.getState().setMetricStatus({ adc: {}, pressure, force: {} });
  document.getElementById('fixture-status').textContent = useDefaults
    ? '同一复现数据 · 默认参数 1 / 4 N/cm² / 100 · 不连接设备或数据库'
    : '马赛克复现 · 润滑2.3 / 颜色0.38 N/cm² / 大小150.1 · 固定规范矩阵，不连接设备或数据库';
}
function activateLegEdge() {
  const pressure = empty();
  // Full canonical rows, including the six-physical-column thigh, without 3D-index feedback.
  for (let row = 0; row <= 46; row++) {
    const columns = row >= 16 && row < 30 ? 12 : 8;
    for (let col = 0; col < columns; col++) pressure.leftFoot[row * 12 + col] = 1.16;
  }
  pressure.leftFoot[18 * 12 + 10] = 3.74;
  pressure.leftFoot[19 * 12 + 11] = 2.6;
  for (let row = 12; row <= 26; row++) for (let col = 4; col <= 19; col++) {
    pressure.jacket[row * 24 + col] = 2.97;
  }
  pressure.jacket[18 * 24 + 16] = 6.27;
  pressure.foot = Array.from({ length: 1536 }, (_, index) => {
    const row = Math.floor(index / 24), col = index % 24;
    return pressure[col < 12 ? 'leftFoot' : 'rightFoot'][row * 12 + col % 12];
  });
  metricData.current = { pressure };
  numericData.current = pressure;
  useEquipStore.setState({ settingValue: {
    ...restoredSettings, gauss: 1, color: 40, colorRange2D: 40, filter: 0, height: 100,
    autoColor: 0, autoColor3D: 0, colorBandRatios: [20, 20, 20, 20, 20],
  } });
  useEquipStore.getState().setMetricStatus({ adc: {}, pressure, force: {} });
  document.getElementById('fixture-status').textContent = '腿内侧蓝白边界 · 固定规范矩阵 · 参数1 / 4 N/cm² / 100 · 放大204% · 不连接设备或数据库';
}
if (legEdgeMode && !datasetMode) activateLegEdge();
else if (mosaicMode && !datasetMode) activateMosaic();
const root = createRoot(document.getElementById('root'));
const fixtureBrush = { rangeArr: [], refreshCurrentMatrix() {}, subscribe() {}, unsubscribe() {}, deleteAll() {}, stopBrush() {}, startBrush() {} };
function ControlsFixture() {
  const [display, setDisplay] = React.useState('point3D');
  const [numericPart, setNumericPart] = React.useState(datasetMode ? 'foot2D' : 'jacket2D');
  const [frameIndex, setFrameIndex] = React.useState(datasetFrameIndex);
  const automatic = useEquipStore(state => Number(state.settingValue.autoColor3D) === 1 && Number(state.settingValue.autoColor) === 1);
  const [onRuler, setOnRuler] = React.useState(false);
  const [onSelect, setOnSelect] = React.useState(false);
  const [onMagnifier, setOnMagnifier] = React.useState(false);
  const changeView = (next, part = numericPart) => {
    useEquipStore.setState({ display: next, displayType: next === 'num' ? part : 'all' });
    useEquipStore.getState().setMetricStatus({ adc: {}, pressure: next === 'num' ? numericData.current : metricData.current.pressure, force: {} });
    setNumericPart(part);
    setDisplay(next);
    if (datasetMode) applyDatasetFrame(frameIndex);
    else if (!mosaicMode && !legEdgeMode) document.getElementById('fixture-status').textContent = armsMode
      ? '双臂四角合成帧 · 2D 左上0.2 / 右上0.8 / 左下1.4 / 右下2.0 N/cm² · 不连接设备或数据库'
      : next === 'num' ? contrastMode
        ? '独立 2D 对比测试 · 炭灰零值与 0.01–2.02 N/cm² 合成压强色块，不连接设备或数据库'
        : '独立 2D 色阶测试 · 合成 0–2.02 N/cm² 梯度，数字固定，不连接设备或数据库'
      : '独立 3D 色阶测试 · 合成 0.2 N/cm² 压强帧，不连接设备或数据库';
  };
  React.useEffect(() => {
    if (datasetMode && display === 'point3D') {
      const id = requestAnimationFrame(() => component.current?.actionSit('foot'));
      return () => cancelAnimationFrame(id);
    } else if (legEdgeMode && display === 'point3D') {
      const id = requestAnimationFrame(() => component.current?.changeCamera(204));
      return () => cancelAnimationFrame(id);
    }
  }, [display]);
  const value = { display, displayType: display === 'num' ? numericPart : 'all', onRuler, setOnRuler, onSelect, setOnSelect, onMagnifier, setOnMagnifier, brushInstance: fixtureBrush };
  return React.createElement(pageContext.Provider, { value },
    display === 'num' ? React.createElement(NumThres, { sitData: numericData }) : React.createElement(ThreeHumanPoint, { metricData, ref: component }),
    React.createElement('div', { className: 'fixture-view-switch' },
      ...(datasetMode ? [['point3D', '3D 下身', 'all'], ['num', '2D 下身', 'foot2D'], ['num', '2D 左腿', 'leftFoot2D'], ['num', '2D 右腿', 'rightFoot2D']] : [['point3D', '3D 模型', 'all'], ['num', '2D 数字', 'jacket2D'], ...(mosaicMode || legEdgeMode ? [['num', '2D 下身', 'foot2D']] : []), ...(armsMode ? [['num', '2D 左臂', 'leftHand2D'], ['num', '2D 右臂', 'rightHand2D']] : [])]).map(([view, label, part]) => React.createElement('button', { key: label, 'aria-pressed': display === view && (view !== 'num' || numericPart === part), onClick: () => changeView(view, part) }, label))),
    legEdgeMode && !datasetMode && React.createElement('div', { className: 'fixture-dataset-controls' },
      React.createElement('button', { onClick: activateLegEdge }, '腿内侧边界复现'),
      React.createElement('button', { onClick: () => component.current?.changeCamera(204) }, '边界放大204%'),
      React.createElement('button', { onClick: () => component.current?.reset3D() }, '整体复位')),
    mosaicMode && !datasetMode && React.createElement('div', { className: 'fixture-dataset-controls' },
      React.createElement('button', { onClick: () => activateMosaic() }, '马赛克复现'),
      React.createElement('button', { onClick: () => activateMosaic(true) }, '同数据默认参数'),
      React.createElement('button', { onClick: () => { metricData.current = { pressure: empty() }; numericData.current = metricData.current.pressure; useEquipStore.getState().setMetricStatus({ adc: {}, pressure: metricData.current.pressure, force: {} }); document.getElementById('fixture-status').textContent = '复现数据已清空'; } }, '清空')),
    datasetMode && React.createElement('div', { className: 'fixture-dataset-controls' },
      React.createElement('label', { htmlFor: 'dataset-frame' }, '数据帧'),
      React.createElement('select', { id: 'dataset-frame', value: frameIndex, onChange: event => { const next = Number(event.target.value); applyDatasetFrame(next); setFrameIndex(next); } },
        ...datasetFrames.map((frame, index) => React.createElement('option', { key: index, value: index }, '第 ' + frame.frame + ' 帧 · ' + frame.seconds.toFixed(3) + ' s'))),
      ...[[false, '统一手动量程 ' + (restoredSettings.color / 10).toFixed(2)], [true, '各视图自动调节']].map(([auto, label]) => React.createElement('button', { key: label, 'aria-pressed': automatic === auto, onClick: () => useEquipStore.setState(state => ({ settingValue: { ...state.settingValue, color: restoredSettings.color, colorRange2D: restoredSettings.colorRange2D, autoColor: auto ? 1 : 0, autoColor3D: auto ? 1 : 0 } })) }, label))),
    React.createElement('div', { className: 'titleContent' }, React.createElement(SecondTitle)));
}
const mount = () => root.render(controlsMode ? React.createElement(ControlsFixture) : React.createElement(ThreeHumanPoint, { metricData, ref: component }));
mount();
if (legEdgeMode && !datasetMode && !controlsMode) requestAnimationFrame(() => component.current?.changeCamera(204));
function activate(part, pressureKpa = 16) {
  metricData.current = { pressure: empty() };
  const activateSensor = sensor => {
    metricData.current.pressure[sensor.sourceKey][sensor.displayIndex] = pressureKpa;
  };
  for (const sensor of sensors) {
    if (part === 'upper-back-edge') {
      if (sensor.canvasId === 'back' && sensor.row >= 3 && sensor.row <= 10
        && sensor.col >= 2 && sensor.col <= 7) activateSensor(sensor);
      continue;
    }
    if (part === 'waist' || part === 'waist-dense') {
      if (sensor.canvasId === 'back' && sensor.y < (part === 'waist' ? 4.4 : 5.3)) activateSensor(sensor);
      continue;
    }
    if (part !== 'all' && sensor.canvasId !== part) continue;
    const shape = archive.canvases[sensor.canvasId];
    const rowCenter = (shape.rows + 1) / 2;
    const colCenter = (shape.cols + 1) / 2;
    if (Math.abs(sensor.row - rowCenter) <= Math.max(1, shape.rows / 8)
      && Math.abs(sensor.col - colCenter) <= Math.max(1, shape.cols / 8)) {
      activateSensor(sensor);
    }
  }
  useEquipStore.getState().setMetricStatus({ adc: {}, pressure: metricData.current.pressure, force: {} });
  document.getElementById('fixture-status').textContent = '合成测试帧：' + part + ' · ' + (part === 'zero' ? 0 : pressureKpa / 10) + ' N/cm²';
}
if (controlsMode && !datasetMode && !mosaicMode && !legEdgeMode) {
  if (armsMode) {
    metricData.current = { pressure: { ...empty(), leftHand: numericData.current.leftHand, rightHand: numericData.current.rightHand } };
    useEquipStore.getState().setMetricStatus({ adc: {}, pressure: metricData.current.pressure, force: {} });
    document.getElementById('fixture-status').textContent = '双臂四角合成帧 · 2D 左上0.2 / 右上0.8 / 左下1.4 / 右下2.0 N/cm² · 不连接设备或数据库';
  } else activate('upper-back-edge', 2);
}
const controls = document.getElementById('fixture-controls');
if (legEdgeMode && !datasetMode && !controlsMode) {
  for (const [label, action] of [['腿内侧边界复现', activateLegEdge], ['边界放大204%', () => component.current?.changeCamera(204)]]) {
    const button = document.createElement('button');
    button.textContent = label;
    button.onclick = action;
    controls.append(button);
  }
}
if (mosaicMode && !datasetMode && !controlsMode) {
  for (const [label, useDefaults] of [['马赛克复现', false], ['同数据默认参数', true]]) {
    const button = document.createElement('button');
    button.textContent = label;
    button.onclick = () => activateMosaic(useDefaults);
    controls.append(button);
  }
}
for (const [id, label] of [['zero','清空'],['head','头部'],['back','背部'],['left-arm','左臂'],['right-arm','右臂'],['left-leg','左腿'],['right-leg','右腿'],['all','六区'],['waist','腰部边界'],['waist-dense','腰部密集施压']]) {
  const button = document.createElement('button');
  button.textContent = label;
  button.dataset.fixture = id;
  button.onclick = () => activate(id);
  controls.append(button);
}
for (const [value, label] of [[0.01, '极低压 0.001'], [0.1, '低压 0.01'], [1, '低压 0.10'], [16, '高压 1.60']]) {
  const button = document.createElement('button');
  button.textContent = label + ' N/cm²';
  button.onclick = () => activate('all', value);
  controls.append(button);
}
const edgeButton = document.createElement('button');
edgeButton.textContent = '上背边缘复现';
edgeButton.onclick = () => {
  useEquipStore.setState({ settingValue: { ...getRestoredVisualSettingValue('endi'), color: 10.5 } });
  activate('upper-back-edge', 2);
  component.current?.actionSit('jacket');
};
controls.append(edgeButton);
for (const [label, action] of [['放大',() => component.current?.changeCamera(150)], ['复位',() => component.current?.reset3D()], ['卸载',() => root.render(null)], ['重挂',mount]]) {
  const button = document.createElement('button');
  button.textContent = label;
  button.onclick = action;
  controls.append(button);
}
if (legsMode) {
  controls.replaceChildren();
  const activateLegSource = (sourceKey, edge = 'all') => {
    const pressure = empty();
    if (sourceKey) {
      // Write canonical source matrix cells directly, independent of the layout mapping.
      const firstCol = sourceKey === 'rightFoot' ? 2 : 0;
      const fromCol = firstCol + (edge === 'last' ? 3 : 0);
      const toCol = edge === 'all' ? firstCol + 4 : fromCol + 1;
      for (let row = 8; row <= 13; row++) for (let col = fromCol; col < toCol; col++) {
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          pressure[sourceKey][(row * 2 + dy) * 12 + col * 2 + dx] = 16;
        }
      }
    }
    metricData.current = { pressure };
    useEquipStore.getState().setMetricStatus({ adc: {}, pressure, force: {} });
    const label = sourceKey === 'leftFoot' ? '左腿源 leftFoot' : sourceKey === 'rightFoot' ? '右腿源 rightFoot' : '清空';
    const columnLabel = sourceKey && edge !== 'all' ? ' · 物理源列 ' + ((sourceKey === 'rightFoot' ? 2 : 0) + (edge === 'last' ? 3 : 0)) : '';
    document.getElementById('fixture-status').textContent = '独立合成测试：' + label + columnLabel + ' · 1.60 N/cm² · 不连接设备或数据库';
    for (const button of controls.children) button.setAttribute('aria-pressed', String(button.dataset.legSource === (sourceKey || '') && button.dataset.legEdge === edge));
  };
  const legCases = legEdgesMode
    ? [['leftFoot', '左腿：源列0', 'first'], ['leftFoot', '左腿：源列3', 'last'], ['rightFoot', '右腿：源列2', 'first'], ['rightFoot', '右腿：源列5', 'last'], ['', '清空', 'all']]
    : [['leftFoot', '仅左腿数据', 'all'], ['rightFoot', '仅右腿数据', 'all'], ['', '清空', 'all']];
  for (const [sourceKey, label, edge] of legCases) {
    const button = document.createElement('button');
    button.textContent = label;
    button.dataset.legSource = sourceKey;
    button.dataset.legEdge = edge;
    button.onclick = () => activateLegSource(sourceKey, edge);
    controls.append(button);
  }
  if (legEdgesMode) {
    const focusButton = document.createElement('button');
    focusButton.textContent = '下身视图';
    focusButton.onclick = () => component.current?.actionSit('foot');
    controls.append(focusButton);
  }
  activateLegSource('leftFoot', legEdgesMode ? 'first' : 'all');
}
`

const server = await createServer({
  root: path.join(projectRoot, 'client'),
  configFile: path.join(projectRoot, 'client/vite.config.js'),
  server: { port: Number(process.env.MANNEQUIN_PREVIEW_PORT) || 5174, strictPort: true, open: false },
  plugins: [{
    name: 'mannequin-render-fixture',
    enforce: 'pre',
    resolveId(id) { if (id === '/__mannequin-fixture.js') return fixtureId },
    load(id) { if (id === fixtureId) return fixture },
    configureServer(vite) {
      vite.middlewares.use('/__mannequin-check', async (_request, response) => {
        const html = await vite.transformIndexHtml('/__mannequin-check', `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><style>body{margin:0;background:#000;font-family:system-ui}#fixture-controls{position:fixed;top:10px;left:10px;z-index:1000;display:flex;gap:4px;flex-wrap:wrap;max-width:85vw}#fixture-controls button{padding:7px;border:1px solid #576579;background:#17212f;color:#fff;border-radius:3px;cursor:pointer}#fixture-status{position:fixed;top:52px;left:12px;z-index:1000;color:#ccd6e3;font-size:12px}</style></head><body><div id="root"></div><div id="fixture-controls"></div><div id="fixture-status">独立渲染测试 · 合成压强帧，不连接设备或数据库</div><script type="module" src="/__mannequin-fixture.js"></script></body></html>`)
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.end(html)
      })
    },
  }],
})
await server.listen()
console.log(`MANNEQUIN_PREVIEW=http://127.0.0.1:${server.config.server.port}/__mannequin-check`)
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0) })
