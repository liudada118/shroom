const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { AsyncLocalStorage } = require('async_hooks')
const Module = require('module')

const FORMULA_PATTERN = /^dummyArea.*\.js$/i
const CONFIG_FILE = 'area_formula.json'
let formulaCache = null
const formulaSnapshot = new AsyncLocalStorage()

// Keep one report, export or history request on a single formula revision, even
// when an external replacement arrives while asynchronous database reads run.
function withAreaFormulaSnapshot(operation) {
  if (formulaSnapshot.getStore()?.active) return operation()
  const snapshot = { active: true }
  try {
    const result = formulaSnapshot.run(snapshot, operation)
    if (result && typeof result.then === 'function') {
      return Promise.resolve(result).finally(() => { snapshot.active = false })
    }
    snapshot.active = false
    return result
  } catch (error) {
    snapshot.active = false
    throw error
  }
}

function rememberFormula(formula) {
  const snapshot = formulaSnapshot.getStore()
  if (snapshot?.active) snapshot.formula = formula
  return formula
}

function getAreaFormulaDir() {
  if (process.env.DUMMY_AREA_FORMULA_DIR) return path.resolve(process.env.DUMMY_AREA_FORMULA_DIR)
  if (process.env.isPackaged === 'true') {
    const resourcesRoot = process.env.RESOURCES_PATH
      || (process.env.appPath ? path.dirname(process.env.appPath) : process.resourcesPath)
    if (!resourcesRoot) throw new Error('无法确定外置面积公式目录，请检查 RESOURCES_PATH')
    return path.join(resourcesRoot, 'kpa')
  }
  return path.join(__dirname, '..', 'kpa')
}

function readSelection(directory) {
  const configPath = path.join(directory, CONFIG_FILE)
  let config
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''))
  } catch (error) {
    if (error.code === 'ENOENT') return 'auto'
    throw new Error(`读取面积公式配置失败：${configPath}；${error.message}`)
  }
  const selected = config && config.formulaFile
  if (selected === undefined || selected === null || selected === '') return 'auto'
  if (typeof selected !== 'string') throw new Error(`面积公式配置 formulaFile 必须为文件名或 auto：${configPath}`)
  if (selected.toLowerCase() === 'auto') return 'auto'
  if (!FORMULA_PATTERN.test(selected) || /[\\/]/.test(selected) || path.basename(selected) !== selected) {
    throw new Error(`面积公式文件名必须以 dummyArea 开头、以 .js 结尾，且不能包含路径：${selected}`)
  }
  return selected
}

function fileVersion(fileName) {
  const match = fileName.slice('dummyArea'.length).match(/\d+(?:\.\d+)*/)
  return match ? match[0] : ''
}

function compareVersions(left, right) {
  const a = left.split('.').map(BigInt)
  const b = right.split('.').map(BigInt)
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const av = a[index] || 0n
    const bv = b[index] || 0n
    if (av !== bv) return av > bv ? 1 : -1
  }
  return 0
}

function compareRecency(left, right) {
  return left.mtimeMs - right.mtimeMs || left.fileName.localeCompare(right.fileName, 'en')
}

function selectFormula(directory, selected) {
  if (selected !== 'auto') return selected
  let entries
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true })
  } catch (error) {
    throw new Error(`读取外置面积公式目录失败：${directory}；${error.message}`)
  }
  const candidates = entries.filter(entry => entry.isFile() && FORMULA_PATTERN.test(entry.name))
    .map(entry => ({
      fileName: entry.name,
      version: fileVersion(entry.name),
      mtimeMs: fs.statSync(path.join(directory, entry.name)).mtimeMs,
    }))
  if (!candidates.length) throw new Error(`未找到面积公式：${directory}，请放入 dummyArea 开头的 .js 文件`)
  const versioned = candidates.filter(item => item.version).sort((left, right) =>
    compareVersions(left.version, right.version) || compareRecency(left, right)).at(-1)
  const unversioned = candidates.filter(item => !item.version).sort(compareRecency).at(-1)
  // Numeric names use semantic version order. A newly supplied name without a
  // version can still replace the default file, using modification time.
  if (!versioned) return unversioned.fileName
  if (!unversioned) return versioned.fileName
  return compareRecency(unversioned, versioned) > 0 ? unversioned.fileName : versioned.fileName
}

function loadAreaFormula() {
  const snapshot = formulaSnapshot.getStore()
  if (snapshot?.active && snapshot.formula) return snapshot.formula
  const directory = getAreaFormulaDir()
  const fileName = selectFormula(directory, readSelection(directory))
  const formulaPath = path.join(directory, fileName)
  let source
  try {
    source = fs.readFileSync(formulaPath)
  } catch (error) {
    throw new Error(`读取外置面积公式失败：${formulaPath}；${error.message}`)
  }
  // Hash the actual bytes even if size and mtime are unchanged. This also detects
  // same-name, same-version replacements made by file-copy tools.
  const revision = `${fileName}:${crypto.createHash('sha256').update(source).digest('hex')}`
  if (formulaCache?.formulaPath === formulaPath && formulaCache.revision === revision) return rememberFormula(formulaCache)
  let api
  try {
    // Execute exactly the bytes that were hashed. A normal require would read
    // the file again and could race with an external copy between the two reads.
    delete require.cache[formulaPath]
    const formulaModule = new Module(formulaPath, module)
    formulaModule.filename = formulaPath
    formulaModule.paths = Module._nodeModulePaths(path.dirname(formulaPath))
    require.cache[formulaPath] = formulaModule
    formulaModule._compile(source.toString('utf8'), formulaPath)
    formulaModule.loaded = true
    api = formulaModule.exports
    if (typeof api?.calculateDummyRawAreaFrame !== 'function') {
      throw new Error('必须导出 calculateDummyRawAreaFrame 函数')
    }
    const version = String(api.VERSION ?? (typeof api.getVersion === 'function' ? api.getVersion() : null)
      ?? (fileVersion(fileName) || 'unknown'))
    formulaCache = { api, fileName, version, revision, formulaPath }
    return rememberFormula(formulaCache)
  } catch (error) {
    delete require.cache[formulaPath]
    throw new Error(`加载外置面积公式失败：${formulaPath}；${error.message}`)
  }
}

module.exports = { getAreaFormulaDir, loadAreaFormula, withAreaFormulaSnapshot }
