const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { getAreaFormulaDir, loadAreaFormula, withAreaFormulaSnapshot } = require('../server/services/AreaFormula')

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-area-loader-'))
  const previous = {}
  for (const key of ['DUMMY_AREA_FORMULA_DIR', 'RESOURCES_PATH', 'appPath', 'isPackaged']) previous[key] = process.env[key]
  process.env.DUMMY_AREA_FORMULA_DIR = directory
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()))
    assert.ok(path.basename(directory).startsWith('shroom-area-loader-'))
    fs.rmSync(directory, { recursive: true, force: true })
  })
  const write = (fileName, value = 1, version = '2.10.36') => {
    const filePath = path.join(directory, fileName)
    fs.writeFileSync(filePath, `module.exports = { VERSION: ${JSON.stringify(version)}, calculateDummyRawAreaFrame() { return { areaCm2: ${value} } } }`)
    return filePath
  }
  const config = formulaFile => fs.writeFileSync(path.join(directory, 'area_formula.json'), JSON.stringify({ formulaFile }))
  return { directory, write, config }
}

test('auto loading compares numeric versions rather than names and detects renamed formulas', t => {
  const { write } = fixture(t)
  write('dummyArea_v2.10.9.js', 9, '2.10.9')
  write('dummyArea_v2.10.36.js', 36)
  write('dummyArea_新版本 v2.10.100.js', 100, '2.10.100')
  const latest = loadAreaFormula()
  assert.equal(latest.fileName, 'dummyArea_新版本 v2.10.100.js')
  assert.equal(latest.version, '2.10.100')
  assert.equal(latest.api.calculateDummyRawAreaFrame().areaCm2, 100)
  write('dummyArea_v3.0.js', 300, '3.0')
  assert.equal(loadAreaFormula().fileName, 'dummyArea_v3.0.js')
})

test('same-name and same-version replacement reloads even with unchanged mtime and size', t => {
  const { write } = fixture(t)
  const filePath = write('dummyArea.js', 1)
  const stamp = fs.statSync(filePath)
  const first = loadAreaFormula()
  assert.equal(loadAreaFormula(), first)
  write('dummyArea.js', 2)
  fs.utimesSync(filePath, stamp.atime, stamp.mtime)
  const second = loadAreaFormula()
  assert.notEqual(second.revision, first.revision)
  assert.equal(second.version, first.version)
  assert.equal(second.api.calculateDummyRawAreaFrame().areaCm2, 2)
})

test('versionless Chinese filenames use modification time and configuration can pin any matching name', t => {
  const { write, config } = fixture(t)
  const old = write('dummyArea_v2.10.36.js', 36)
  fs.utimesSync(old, new Date(1000), new Date(1000))
  write('dummyArea 新公式.js', 80, '新版')
  assert.equal(loadAreaFormula().fileName, 'dummyArea 新公式.js')
  config('dummyArea_v2.10.36.js')
  assert.equal(loadAreaFormula().api.calculateDummyRawAreaFrame().areaCm2, 36)
  config('auto')
  assert.equal(loadAreaFormula().api.calculateDummyRawAreaFrame().areaCm2, 80)
})

test('missing, invalid, and broken formulas fail explicitly instead of using a cached formula', t => {
  const { directory, write, config } = fixture(t)
  assert.throws(loadAreaFormula, /未找到面积公式/)
  write('dummyArea.js')
  loadAreaFormula()
  config('dummyArea_missing.js')
  assert.throws(loadAreaFormula, /读取外置面积公式失败.*dummyArea_missing\.js/)
  config('../dummyArea.js')
  assert.throws(loadAreaFormula, /不能包含路径/)
  config('auto')
  fs.writeFileSync(path.join(directory, 'dummyArea.js'), 'module.exports = {}')
  assert.throws(loadAreaFormula, /必须导出 calculateDummyRawAreaFrame/)
  fs.writeFileSync(path.join(directory, 'dummyArea.js'), 'module.exports = {')
  assert.throws(loadAreaFormula, /加载外置面积公式失败/)
  fs.writeFileSync(path.join(directory, 'area_formula.json'), '{broken')
  assert.throws(loadAreaFormula, /读取面积公式配置失败/)
})

test('packaged paths use the external resources directory and allow an explicit directory override', t => {
  const { directory, write } = fixture(t)
  process.env.isPackaged = 'true'
  process.env.RESOURCES_PATH = path.join(directory, 'resources')
  assert.equal(getAreaFormulaDir(), directory)
  write('dummyArea_override.js')
  assert.equal(loadAreaFormula().fileName, 'dummyArea_override.js')
  delete process.env.DUMMY_AREA_FORMULA_DIR
  assert.equal(getAreaFormulaDir(), path.join(directory, 'resources', 'kpa'))
  fs.mkdirSync(getAreaFormulaDir(), { recursive: true })
  fs.writeFileSync(path.join(getAreaFormulaDir(), 'dummyArea_v9.js'), 'module.exports = { getVersion() { return "9.0" }, calculateDummyRawAreaFrame() { return null } }')
  assert.equal(loadAreaFormula().version, '9.0')
  delete process.env.RESOURCES_PATH
  process.env.appPath = path.join(directory, 'resources', 'app.asar')
  assert.equal(getAreaFormulaDir(), path.join(directory, 'resources', 'kpa'))
})

test('module version may come from filename when VERSION is absent', t => {
  const { directory } = fixture(t)
  fs.writeFileSync(path.join(directory, 'dummyArea_v4.7.1.js'), 'module.exports = { calculateDummyRawAreaFrame() { return null } }')
  assert.equal(loadAreaFormula().version, '4.7.1')
})

test('one asynchronous export keeps its formula revision while the next operation sees replacement', async t => {
  const { write } = fixture(t)
  write('dummyArea.js', 1)
  const old = await withAreaFormulaSnapshot(async () => {
    const first = loadAreaFormula()
    write('dummyArea.js', 2)
    await Promise.resolve()
    assert.equal(loadAreaFormula(), first)
    return first
  })
  const current = loadAreaFormula()
  assert.notEqual(current.revision, old.revision)
  assert.equal(current.api.calculateDummyRawAreaFrame().areaCm2, 2)
})

test('timers created during a request stop retaining its snapshot when the request finishes', async t => {
  const { write } = fixture(t)
  write('dummyArea.js', 1)
  let future
  let old
  withAreaFormulaSnapshot(() => {
    old = loadAreaFormula()
    future = new Promise(resolve => setImmediate(() => resolve(loadAreaFormula())))
  })
  write('dummyArea.js', 2)
  const later = await future
  assert.notEqual(later.revision, old.revision)
  assert.equal(later.api.calculateDummyRawAreaFrame().areaCm2, 2)
})

test('a replacement between reading and evaluation cannot mismatch the executed formula and revision', t => {
  const { write } = fixture(t)
  const target = write('dummyArea.js', 1)
  const originalRead = fs.readFileSync
  let captured
  fs.readFileSync = function readAndReplace(filePath, ...args) {
    const contents = originalRead.call(this, filePath, ...args)
    if (path.resolve(String(filePath)) === target) {
      captured = contents
      fs.readFileSync = originalRead
      write('dummyArea.js', 2)
    }
    return contents
  }
  t.after(() => { fs.readFileSync = originalRead })
  const oldBytes = loadAreaFormula()
  const hash = require('node:crypto').createHash('sha256').update(captured).digest('hex')
  assert.equal(oldBytes.revision, `dummyArea.js:${hash}`)
  assert.equal(oldBytes.api.calculateDummyRawAreaFrame().areaCm2, 1)
  const newBytes = loadAreaFormula()
  assert.equal(newBytes.api.calculateDummyRawAreaFrame().areaCm2, 2)
  assert.notEqual(oldBytes.revision, newBytes.revision)
})
