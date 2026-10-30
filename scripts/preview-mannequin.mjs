import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createServer } from '../client/node_modules/vite/dist/node/index.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixtureId = '\0mannequin-render-fixture'
const fixture = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import ThreeHumanPoint from '/src/components/three/ThreeHumanPoint.js';
import { useEquipStore } from '/src/store/equipStore.js';
import { buildMannequinSensorLayout } from '/src/util/mannequinSensorLayout.js';
import { getRestoredVisualSettingValue } from '/src/util/visualSettingStorage.js';
const archive = await fetch('/model/mannequin_sensor_layout_637.json').then(r => r.json());
const sensors = buildMannequinSensorLayout(archive);
const empty = () => ({ jacket: new Array(1296).fill(0), leftHand: new Array(144).fill(0), rightHand: new Array(144).fill(0), leftFoot: new Array(768).fill(0), rightFoot: new Array(768).fill(0) });
const metricData = { current: { pressure: empty() } };
const component = React.createRef();
useEquipStore.setState({ settingValue: getRestoredVisualSettingValue('endi') });
const root = createRoot(document.getElementById('root'));
const mount = () => root.render(React.createElement(ThreeHumanPoint, { metricData, ref: component }));
mount();
function activate(part) {
  metricData.current = { pressure: empty() };
  const activateSensor = sensor => {
    metricData.current.pressure[sensor.sourceKey][sensor.displayIndex] = 16;
  };
  for (const sensor of sensors) {
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
  document.getElementById('fixture-status').textContent = '测试帧：' + part;
}
const controls = document.getElementById('fixture-controls');
for (const [id, label] of [['zero','清空'],['head','头部'],['back','背部'],['left-arm','左臂'],['right-arm','右臂'],['left-leg','左腿'],['right-leg','右腿'],['all','六区'],['waist','腰部边界'],['waist-dense','腰部密集施压']]) {
  const button = document.createElement('button');
  button.textContent = label;
  button.dataset.fixture = id;
  button.onclick = () => activate(id);
  controls.append(button);
}
for (const [label, action] of [['放大',() => component.current?.changeCamera(150)], ['复位',() => component.current?.reset3D()], ['卸载',() => root.render(null)], ['重挂',mount]]) {
  const button = document.createElement('button');
  button.textContent = label;
  button.onclick = action;
  controls.append(button);
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
