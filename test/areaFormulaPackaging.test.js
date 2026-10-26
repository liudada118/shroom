const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const asar = require('@electron/asar')
const { getMainFileMatchers, getFileMatchers, copyFiles } = require('app-builder-lib/out/fileMatcher')

const repository = path.resolve(__dirname, '..')
const build = require('../package.json').build

test('electron-builder file rules place versioned area formulas outside the actual ASAR archive', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-area-packaging-'))
  const source = path.join(directory, 'source')
  const staged = path.join(directory, 'app-stage')
  const resources = path.join(directory, 'output', 'resources')
  const output = path.dirname(resources)
  t.after(() => {
    asar.uncacheAll()
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()))
    assert.ok(path.basename(directory).startsWith('shroom-area-packaging-'))
    fs.rmSync(directory, { recursive: true, force: true })
  })

  const write = (filename, content) => {
    const destination = path.join(source, filename)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.writeFileSync(destination, content)
  }
  write('package.json', JSON.stringify({ name: 'area-packaging-fixture', version: '1.0.0', main: 'index.js' }))
  write('index.js', 'module.exports = true\n')
  write('util/pressureFrameProcessor.js', 'module.exports = {}\n')
  write('server/services/AreaFormula.js', 'module.exports = {}\n')
  write('server/kpa/dummyPressure.v2.10.28.js', 'module.exports = { pressure: true }\n')
  write('server/kpa/unrelated.js', 'module.exports = {}\n')
  write('db/example.json', '{}')
  write('data/example.csv', 'value\n0\n')
  const externalFiles = ['dummyArea_v2.10.36.js', 'area_formula.json', 'AREA_FORMULA_README.md']
  for (const filename of externalFiles) {
    write(`server/kpa/${filename}`, fs.readFileSync(path.join(repository, 'server', 'kpa', filename)))
  }
  const futureFiles = ['dummyArea_v9.1.js', 'dummyArea_后续版本.js']
  for (const filename of futureFiles) write(`server/kpa/${filename}`, 'module.exports = { replacement: true }\n')

  const configuration = structuredClone(build)
  const options = {
    macroExpander: value => value,
    customBuildOptions: {},
    globalOutDir: output,
    defaultSrc: source,
  }
  // Exercise the installed electron-builder's real matchers and copy operation,
  // then create/read an ASAR archive, instead of merely checking glob strings.
  const appMatchers = getMainFileMatchers(source, staged, options.macroExpander, {}, {
    info: {
      projectDir: source,
      buildResourcesDir: 'build',
      isPrepackedAppAsar: false,
      config: configuration,
      debugLogger: { isEnabled: false },
    },
  }, output, false)
  await copyFiles(appMatchers, null, false)
  fs.mkdirSync(resources, { recursive: true })
  const archive = path.join(resources, 'app.asar')
  await asar.createPackage(staged, archive)
  await copyFiles(getFileMatchers(configuration, 'extraResources', resources, options), null, false)

  const packedFiles = asar.listPackage(archive).map(filename => filename.replace(/\\/g, '/'))
  assert.ok(packedFiles.includes('/server/services/AreaFormula.js'))
  assert.ok(packedFiles.includes('/util/pressureFrameProcessor.js'))
  assert.ok(packedFiles.includes('/server/kpa/dummyPressure.v2.10.28.js'))
  for (const filename of [...externalFiles, ...futureFiles]) {
    assert.ok(!packedFiles.includes(`/server/kpa/${filename}`), `${filename} must not be embedded in app.asar`)
    const externalPath = path.join(resources, 'kpa', filename)
    assert.ok(fs.statSync(externalPath).isFile(), `${filename} must be present in resources/kpa`)
    assert.deepEqual(fs.readFileSync(externalPath), fs.readFileSync(path.join(source, 'server', 'kpa', filename)))
  }
  assert.equal(fs.existsSync(path.join(resources, 'kpa', 'dummyPressure.v2.10.28.js')), false)
  assert.equal(fs.existsSync(path.join(resources, 'kpa', 'unrelated.js')), false)
  assert.equal(require(path.join(resources, 'kpa', 'dummyArea_v9.1.js')).replacement, true)
})
