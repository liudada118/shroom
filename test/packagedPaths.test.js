const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')

const source = fs.readFileSync(path.join(__dirname, '../server/serialServer.js'), 'utf8')

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-paths-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const resources = path.join(root, 'SHROOM-SEAT.app/Contents/Resources')
  const appPath = path.join(resources, 'app.asar')
  const userData = path.join(root, 'user-data')
  fs.mkdirSync(path.join(resources, 'db/corrupt-backups'), { recursive: true })
  fs.mkdirSync(path.join(resources, 'data/csv'), { recursive: true })
  fs.mkdirSync(path.join(appPath, 'server'), { recursive: true })
  fs.writeFileSync(path.join(resources, 'db/init.db'), 'database template')
  fs.writeFileSync(path.join(resources, 'db/car.db'), 'seed database')
  fs.writeFileSync(path.join(resources, 'db/car.db-wal'), 'transient wal')
  fs.writeFileSync(path.join(resources, 'db/car.db-shm'), 'transient shm')
  fs.writeFileSync(path.join(resources, 'db/corrupt-backups/old.db'), 'corrupt')
  fs.writeFileSync(path.join(resources, 'data/csv/sample.csv'), 'sample')
  fs.writeFileSync(path.join(appPath, 'config.txt'), 'bundled config')
  fs.symlinkSync(path.join(resources, 'db/init.db'), path.join(resources, 'db/link.db'))

  function boot(packaged = true) {
    const state = {}
    let cachePath
    let configReadPath
    const stop = new Error('stop before starting network services')
    const mocks = {
      express: () => { throw stop },
      cors: () => {},
      '../util/portFinder': { DEFAULT_PORTS: {} },
      '../util/db': {},
      '../util/serialCache': { setCachePath: (value) => { cachePath = value } },
      '../util/systemConfig': {
        readEncryptedSystemConfig: (value) => {
          configReadPath = value
          return { value: 'car' }
        },
      },
      './state': { state },
      './websocket': {},
      './api/routes': {},
      './services/DataService': { loadPersistedDataDirection: () => {} },
    }
    try {
      vm.runInNewContext(source, {
        require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
        __dirname: path.join(appPath, 'server'),
        console: { log() {} },
        process: { env: {
          isPackaged: String(packaged),
          appPath,
          RESOURCES_PATH: resources,
          USER_DATA_PATH: userData,
        } },
      })
      assert.fail('expected initialization to reach Express')
    } catch (error) {
      if (error !== stop) throw error
    }
    return { ...state, cachePath, configReadPath }
  }
  return { resources, appPath, userData, boot }
}

test('packaged writes use user data and keep signed resources unchanged', (t) => {
  const { resources, appPath, userData, boot } = setup(t)
  const state = boot()
  assert.equal(state._dbPath, path.join(userData, 'db'))
  assert.equal(state._dataPath, path.join(userData, 'data'))
  assert.equal(state._configPath, path.join(userData, 'config.txt'))
  assert.equal(state.configReadPath, state._configPath)
  assert.equal(state.cachePath, path.join(userData, 'serial_cache.json'))
  fs.writeFileSync(path.join(state._dbPath, 'car.db-wal'), 'new transaction')
  fs.writeFileSync(path.join(state._dataPath, 'export.csv'), 'new export')
  fs.writeFileSync(state._configPath, 'user settings')
  assert.equal(fs.readFileSync(path.join(resources, 'db/car.db-wal'), 'utf8'), 'transient wal')
  assert.equal(fs.existsSync(path.join(resources, 'data/export.csv')), false)
  assert.equal(fs.readFileSync(path.join(appPath, 'config.txt'), 'utf8'), 'bundled config')
})

test('first launch seeds required files without transient or corrupt databases', (t) => {
  const { userData, boot } = setup(t)
  boot()
  assert.equal(fs.readFileSync(path.join(userData, 'db/init.db'), 'utf8'), 'database template')
  assert.equal(fs.readFileSync(path.join(userData, 'data/csv/sample.csv'), 'utf8'), 'sample')
  assert.equal(fs.readFileSync(path.join(userData, 'config.txt'), 'utf8'), 'bundled config')
  for (const name of ['car.db-wal', 'car.db-shm', 'corrupt-backups', 'link.db']) {
    assert.equal(fs.existsSync(path.join(userData, 'db', name)), false, name)
  }
})

test('subsequent launches preserve existing user databases and settings', (t) => {
  const { userData, boot } = setup(t)
  fs.mkdirSync(path.join(userData, 'db'), { recursive: true })
  fs.writeFileSync(path.join(userData, 'db/car.db'), 'existing measurements')
  fs.writeFileSync(path.join(userData, 'config.txt'), 'existing settings')
  boot()
  boot()
  assert.equal(fs.readFileSync(path.join(userData, 'db/car.db'), 'utf8'), 'existing measurements')
  assert.equal(fs.readFileSync(path.join(userData, 'config.txt'), 'utf8'), 'existing settings')
})

test('development keeps using repository paths', (t) => {
  const { appPath, userData, boot } = setup(t)
  const state = boot(false)
  assert.equal(state._dbPath, path.join(appPath, 'db'))
  assert.equal(state._dataPath, path.join(appPath, 'data'))
  assert.equal(state._configPath, path.join(appPath, 'config.txt'))
  assert.equal(fs.existsSync(userData), false)
})
