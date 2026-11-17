'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const RUNTIME_PATH = path.join(ROOT, 'util', 'calibrationRuntime.js')
const SESSION_PATH = path.join(ROOT, 'util', 'seatBackrestSession.js')
const ALGORITHM_FILE = 'seatBackrestPressure_v2.12.0.js'
const ALGORITHM_PATH = path.join(ROOT, 'calibration', ALGORITHM_FILE)
const TYPES = ['endi-23x23', 'new-backrest-32x25']
const ENVIRONMENT_KEYS = [
  'PRESSURE_FORMULA_DIR', 'PRESSURE_FORMULA_PATH', 'IS_PACKAGED', 'isPackaged', 'RESOURCES_PATH',
  'PRESSURE_CONFIG_PATH',
]

function temporaryDirectory(t) {
  const tempParent = path.resolve(os.tmpdir())
  const directory = fs.mkdtempSync(path.join(tempParent, 'shroom-external-calibration-'))
  t.after(() => {
    // Only remove the exact directory this test created, never a caller path.
    assert.equal(path.dirname(path.resolve(directory)), tempParent)
    assert.ok(path.basename(directory).startsWith('shroom-external-calibration-'))
    fs.rmSync(directory, { recursive: true, force: true })
  })
  return directory
}

function runIsolated(code, environment = {}) {
  const env = { ...process.env }
  for (const key of ENVIRONMENT_KEYS) delete env[key]
  Object.assign(env, environment)
  const child = spawnSync(process.execPath, ['-e', code], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    timeout: 20000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  })
  assert.ifError(child.error)
  assert.equal(child.status, 0, `Calibration child failed:\n${child.stdout}\n${child.stderr}`)
}

function algorithmWithResult(version, forceN) {
  // Keep the delivered contract, geometry and actual stateful implementation;
  // only public version/result fields differ to model a future file replacement.
  return `${fs.readFileSync(ALGORITHM_PATH, 'utf8')}\n;(() => {
    const delivered = module.exports;
    module.exports = Object.freeze({
      ...delivered,
      VERSION: ${JSON.stringify(version)},
      createSensorSession(type, options) {
        const original = delivered.createSensorSession(type, options);
        return Object.freeze({
          ...original,
          update(frame) {
            const output = original.update(frame);
            return { ...output, forceN: ${forceN},
              forceMetrics: { ...output.forceMetrics, forceN: ${forceN} } };
          }
        });
      }
    });
  })();\n`
}

function writeAlgorithm(directory, source = fs.readFileSync(ALGORITHM_PATH), fileName = ALGORITHM_FILE) {
  fs.mkdirSync(directory, { recursive: true })
  const file = path.join(directory, fileName)
  fs.writeFileSync(file, source)
  return file
}

for (const packagedEnvironment of [{ IS_PACKAGED: '1' }, { isPackaged: 'true' }]) {
  test(`packaged resources/calibration is loaded outside app.asar (${Object.keys(packagedEnvironment)[0]})`, (t) => {
    const directory = temporaryDirectory(t)
    const resources = path.join(directory, 'resources')
    const calibration = path.join(resources, 'calibration')
    const file = writeAlgorithm(calibration)
    runIsolated(`
      const assert = require('node:assert/strict');
      const { getCalibrationRuntime, getCalibrationDirectory, DEFAULT_CALIBRATION_FILE } = require(${JSON.stringify(RUNTIME_PATH)});
      assert.equal(getCalibrationDirectory(), ${JSON.stringify(calibration)});
      assert.equal(DEFAULT_CALIBRATION_FILE, ${JSON.stringify(ALGORITHM_FILE)});
      const runtime = getCalibrationRuntime();
      assert.equal(runtime.filePath, ${JSON.stringify(file)});
      assert.equal(runtime.version, '2.12.0');
      assert.equal(runtime.api.runSelfCheck().passed, true);
      assert.ok(!runtime.filePath.includes('app.asar'));
    `, { ...packagedEnvironment, RESOURCES_PATH: resources })
  })
}

test('explicit source path wins over file override, which wins over directory override', (t) => {
  const directory = temporaryDirectory(t)
  const directoryFile = writeAlgorithm(path.join(directory, 'directory'), algorithmWithResult('2.98.0', 111))
  const overrideFile = writeAlgorithm(path.join(directory, 'file'), algorithmWithResult('2.99.0', 222))
  const explicitFile = writeAlgorithm(path.join(directory, 'explicit'), algorithmWithResult('3.00.0', 333))
  runIsolated(`
    const assert = require('node:assert/strict');
    const { getCalibrationRuntime, getCalibrationDirectory } = require(${JSON.stringify(RUNTIME_PATH)});
    assert.equal(getCalibrationDirectory(), ${JSON.stringify(path.dirname(directoryFile))});
    assert.equal(getCalibrationRuntime().filePath, ${JSON.stringify(overrideFile)});
    const explicit = getCalibrationRuntime({ sourcePath: ${JSON.stringify(explicitFile)} });
    assert.equal(explicit.filePath, ${JSON.stringify(explicitFile)});
    assert.equal(explicit.version, '3.00.0');
  `, { PRESSURE_FORMULA_DIR: path.dirname(directoryFile), PRESSURE_FORMULA_PATH: overrideFile })
})

test('replacing the same external file reloads future versions and starts a fresh session', (t) => {
  const directory = temporaryDirectory(t)
  const firstSource = algorithmWithResult('2.99.0', 111)
  const secondSource = algorithmWithResult('2.99.1', 222)
  assert.equal(Buffer.byteLength(firstSource), Buffer.byteLength(secondSource))
  const file = writeAlgorithm(directory, firstSource)
  const replacement = path.join(directory, 'replacement.js')
  fs.writeFileSync(replacement, secondSource)
  runIsolated(`
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const { getCalibrationRuntime } = require(${JSON.stringify(RUNTIME_PATH)});
    const { createSensorSession } = require(${JSON.stringify(SESSION_PATH)});
    const first = getCalibrationRuntime();
    const frame = { raw: Array(1024).fill(0), timestampMs: 0 };
    const oldSession = createSensorSession('endi-23x23', {}, { runtime: first });
    assert.equal(oldSession.process(frame).forceN, 111);
    const before = fs.statSync(${JSON.stringify(file)});
    fs.copyFileSync(${JSON.stringify(replacement)}, ${JSON.stringify(file)});
    // Same path/size/mtime must not turn an old result into the current formula.
    fs.utimesSync(${JSON.stringify(file)}, before.atime, before.mtime);
    const second = getCalibrationRuntime();
    assert.equal(second.version, '2.99.1');
    assert.notEqual(second.identity, first.identity);
    assert.notEqual(second.checksum, first.checksum);
    assert.notStrictEqual(second.api, first.api);
    const newSession = createSensorSession('endi-23x23', {}, { runtime: second });
    assert.equal(newSession.process(frame).forceN, 222);
    assert.equal(oldSession.process({ ...frame, timestampMs: 1 }).forceN, 111);
    assert.strictEqual(getCalibrationRuntime(), second);
  `, { PRESSURE_FORMULA_DIR: directory })
})

test('a future version filename replaces the old file without changing any configuration', (t) => {
  const directory = temporaryDirectory(t)
  const resources = path.join(directory, 'resources')
  const calibration = path.join(resources, 'calibration')
  const oldFile = writeAlgorithm(calibration, algorithmWithResult('2.99.0', 111), 'seatBackrestPressure_v2.99.0.js')
  const futureFile = path.join(calibration, 'seatBackrestPressure_v3.00.0.js')
  const deliveryFile = writeAlgorithm(path.join(directory, 'next-delivery'), algorithmWithResult('3.00.0', 333), 'seatBackrestPressure_v3.00.0.js')
  runIsolated(`
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const { getCalibrationRuntime } = require(${JSON.stringify(RUNTIME_PATH)});
    const { createSensorSession } = require(${JSON.stringify(SESSION_PATH)});
    const oldRuntime = getCalibrationRuntime();
    assert.equal(oldRuntime.filePath, ${JSON.stringify(oldFile)});
    fs.unlinkSync(${JSON.stringify(oldFile)});
    fs.copyFileSync(${JSON.stringify(deliveryFile)}, ${JSON.stringify(futureFile)});
    const futureRuntime = getCalibrationRuntime();
    assert.equal(futureRuntime.filePath, ${JSON.stringify(futureFile)});
    assert.equal(futureRuntime.formulaFile, 'seatBackrestPressure_v3.00.0.js');
    assert.equal(futureRuntime.version, '3.00.0');
    assert.notEqual(futureRuntime.identity, oldRuntime.identity);
    const session = createSensorSession('endi-23x23', {}, { runtime: futureRuntime });
    assert.equal(session.process({ raw: Array(1024).fill(0), timestampMs: 0 }).forceN, 333);
    assert.deepEqual(fs.readdirSync(${JSON.stringify(calibration)}), ['seatBackrestPressure_v3.00.0.js']);
  `, { IS_PACKAGED: '1', RESOURCES_PATH: resources })
})

test('multiple matching algorithm files fail instead of silently choosing a version', (t) => {
  const directory = temporaryDirectory(t)
  const first = writeAlgorithm(directory)
  writeAlgorithm(directory, algorithmWithResult('3.00.0', 333), 'seatBackrestPressure_v3.00.0.js')
  runIsolated(`
    const assert = require('node:assert/strict');
    const { getCalibrationRuntime } = require(${JSON.stringify(RUNTIME_PATH)});
    assert.throws(() => getCalibrationRuntime(), /multiple|ambiguous|多个|唯一|only one/i);
    assert.equal(getCalibrationRuntime({ sourcePath: ${JSON.stringify(first)} }).version, '2.12.0');
  `, { PRESSURE_FORMULA_DIR: directory })
})

test('prefix scanning ignores unrelated files and subdirectories', (t) => {
  const directory = temporaryDirectory(t)
  const unrelated = path.join(directory, 'otherAlgorithm.js')
  fs.writeFileSync(unrelated, algorithmWithResult('9.99.0', 999))
  writeAlgorithm(path.join(directory, 'nested'), algorithmWithResult('8.99.0', 888), 'seatBackrestPressure_v8.99.0.js')
  fs.mkdirSync(path.join(directory, 'seatBackrestPressure_directory.js'))
  runIsolated(`
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const { getCalibrationRuntime } = require(${JSON.stringify(RUNTIME_PATH)});
    assert.throws(() => getCalibrationRuntime(), error => error.message.includes(${JSON.stringify(directory)}));
    fs.copyFileSync(${JSON.stringify(ALGORITHM_PATH)}, ${JSON.stringify(path.join(directory, ALGORITHM_FILE))});
    const runtime = getCalibrationRuntime();
    assert.equal(runtime.version, '2.12.0');
    assert.equal(runtime.formulaFile, ${JSON.stringify(ALGORITHM_FILE)});
  `, { PRESSURE_FORMULA_DIR: directory })
})

test('saved old formula names do not pin a new prefixed file to the old version', (t) => {
  const directory = temporaryDirectory(t)
  const calibration = path.join(directory, 'calibration')
  const selected = writeAlgorithm(calibration, algorithmWithResult('3.00.0', 333), 'seatBackrestPressure_v3.00.0.js')
  const configPath = path.join(directory, 'pressure_config.json')
  const savedConfig = JSON.stringify({
    pressureFormulaFile: 'seatBackrestPressure_v2.11.0.js',
    pressureFormulaProfile: 'seatBackrestPressure_v2.11.0',
  })
  fs.writeFileSync(configPath, savedConfig)
  runIsolated(`
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const config = require(${JSON.stringify(path.join(ROOT, 'server', 'services', 'PressureConfig.js'))});
    const actual = config.loadPressureConfig();
    assert.equal(actual.pressureFormulaFile, 'seatBackrestPressure_v3.00.0.js');
    assert.equal(actual.pressureFormulaProfile, 'seatBackrestPressure_v3.00.0');
    assert.equal(actual.algorithmVersion, '3.00.0');
    assert.equal(actual.algorithmPath, ${JSON.stringify(selected)});
    assert.equal(config.loadPressureFormula().VERSION, '3.00.0');
    assert.deepEqual(config.listPressureFormulaFiles(), ['seatBackrestPressure_v3.00.0.js']);
    assert.equal(fs.readFileSync(${JSON.stringify(configPath)}, 'utf8'), ${JSON.stringify(savedConfig)});
  `, { PRESSURE_FORMULA_DIR: calibration, PRESSURE_CONFIG_PATH: configPath })
})

test('Electron packaging keeps the prefixed algorithm external and excludes the delivery archive', () => {
  const { build } = require('../package.json')
  const minimatchModule = require('minimatch')
  const minimatch = minimatchModule.minimatch || minimatchModule
  const external = build.extraResources.find((entry) => entry.from === 'calibration')
  assert.ok(external, 'calibration must be copied next to app.asar')
  assert.equal(external.to, 'calibration')
  const matchesResource = (file) => external.filter.some((pattern) => minimatch(file, pattern))
  assert.equal(matchesResource(ALGORITHM_FILE), true)
  assert.equal(matchesResource('seatBackrestPressure_v3.00.0.js'), true)
  for (const excluded of ['README.md', 'otherAlgorithm.js', 'seatBackrestPressure_v2.12.0.d.ts', `nested/${ALGORITHM_FILE}`]) {
    assert.equal(matchesResource(excluded), false, excluded)
  }
  const isBundled = (file) => build.files.reduce((included, pattern) => (
    pattern.startsWith('!')
      ? included && !minimatch(file, pattern.slice(1))
      : included || minimatch(file, pattern)
  ), false)
  assert.equal(isBundled('server/services/PressureConfig.js'), true)
  assert.equal(isBundled(`calibration/${ALGORITHM_FILE}`), false)
  assert.equal(isBundled('server/kpa/恩迪坐垫靠背压力算法JS_v2.12.0.zip'), false)
  assert.equal(isBundled(`server/kpa/恩迪坐垫靠背压力算法JS_v2.12.0/恩迪坐垫靠背压力算法JS_v2.12.0/算法JS/${ALGORITHM_FILE}`), false)
})

test('missing or incompatible external files fail explicitly without using a bundled fallback', (t) => {
  const directory = temporaryDirectory(t)
  const missing = path.join(directory, 'missing-calibration.js')
  const invalid = path.join(directory, 'invalid-calibration.js')
  fs.writeFileSync(invalid, "module.exports = { VERSION: '3.0.0' }\n")
  runIsolated(`
    const assert = require('node:assert/strict');
    const { getCalibrationRuntime } = require(${JSON.stringify(RUNTIME_PATH)});
    assert.throws(() => getCalibrationRuntime(), error => error.message.includes(${JSON.stringify(missing)}));
    assert.throws(() => getCalibrationRuntime({ sourcePath: ${JSON.stringify(invalid)} }), /contract|interface|接口|incompatible/i);
  `, { PRESSURE_FORMULA_PATH: missing })
})

function framesFor(type, api) {
  const definition = api.SENSOR_DEFINITIONS[type]
  const rows = definition.physicalRows
  const cols = definition.physicalCols
  const amplitudes = [0, 60, 100, 145, 190, 155, 95, 0]
  return amplitudes.map((amplitude, step) => ({
    physical: Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => {
      const r = type === 'endi-23x23' ? 10 : 18
      const distance = ((row - r) / 3) ** 2 + ((col - 10) / 3) ** 2
      return Math.min(255, Math.round(amplitude * Math.exp(-distance / 2)))
    })),
    timestampMs: step * 125,
    ...(step === 5 ? { reset: true } : {}),
  }))
}

for (const type of TYPES) {
  test(`${type}: native v2.12.0 session equals the delivered sequence and preserves inputs`, () => {
    const api = require(ALGORITHM_PATH)
    const { getCalibrationRuntime } = require(RUNTIME_PATH)
    const { createSensorSession } = require(SESSION_PATH)
    const runtime = getCalibrationRuntime({ sourcePath: ALGORITHM_PATH })
    const frames = framesFor(type, api)
    const inputBefore = JSON.stringify(frames)
    const expected = api.calculateSensorSequence(frames, type)
    const session = createSensorSession(type, {}, { runtime })
    assert.deepEqual(frames.map((frame) => session.process(frame)), expected)
    assert.equal(JSON.stringify(frames), inputBefore)
    assert.ok(expected.some((frame) => frame.forceN > 0))
    assert.ok(expected.some((frame) => frame.areaCm2 > 0))
    const loaded = expected.find((frame) => frame.forceN > 0)
    assert.equal(loaded.forceN, loaded.forceMetrics.forceN)
    assert.equal(loaded.areaCm2, loaded.areaMetrics.areaCm2)
    assert.equal(loaded.sourceMatrix.length, api.SENSOR_DEFINITIONS[type].interpolatedRows)
    assert.equal(loaded.sourceMatrix[0].length, api.SENSOR_DEFINITIONS[type].interpolatedCols)
  })

  test(`${type}: backward timestamps are rejected before consuming state and reset accepts a new origin`, () => {
    const api = require(ALGORITHM_PATH)
    const { createSensorSession } = require(SESSION_PATH)
    const frames = framesFor(type, api).slice(1, 4)
    const expected = api.calculateSensorSequence(frames, type)
    const session = createSensorSession(type, {}, { sourcePath: ALGORITHM_PATH })
    assert.deepEqual(session.process(frames[0]), expected[0])
    assert.throws(() => session.process({ ...frames[1], timestampMs: frames[0].timestampMs - 1 }), /nondecreasing|timestamp|时间/i)
    assert.throws(() => session.process({ ...frames[1], timestampMs: NaN }), /timestamp|时间/i)
    assert.deepEqual(session.process(frames[1]), expected[1])
    session.reset()
    const newOrigin = { ...frames[0], timestampMs: 0 }
    assert.deepEqual(session.process(newOrigin), api.calculateSensorSequence([newOrigin], type)[0])
  })
}
