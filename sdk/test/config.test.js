'use strict'

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const config = require('../node/config')

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-sdk-config-'))

try {
  const encrypted = config.encryptString('{"ok":true}')
  assert.strictEqual(config.decryptString(encrypted), '{"ok":true}')
  assert.deepStrictEqual(config.extractFirstJsonObject('xx {"a":1,"b":{"c":2}} yy'), { a: 1, b: { c: 2 } })

  const pressurePath = path.join(tempDir, 'pressure_config.json')
  const pressureConfig = config.loadPressureConfig(pressurePath)
  assert.strictEqual(pressureConfig.pressureFormulaFile, config.DEFAULT_PRESSURE_CONFIG.pressureFormulaFile)

  const migrated = config.normalizePressureConfig({
    pressureFormulaFile: 'pressureFormula_calibration_v2746_seat_v2752_backrest.js',
    pressureFormulaProfile: 'calibration_v2746_seat_v2752_backrest',
  })
  assert.strictEqual(migrated.pressureFormulaFile, 'point_pressure_calibration.js')
  assert.strictEqual(migrated.pressureFormulaProfile, 'point_pressure_calibration')

  const saved = config.savePressureConfig(pressurePath, {
    backValueMultiplier: 2,
    pressureFormulaFile: '../bad.txt',
  })
  assert.strictEqual(Object.hasOwn(saved, 'backValueMultiplier'), false)
  assert.strictEqual(saved.pressureFormulaFile, config.DEFAULT_PRESSURE_CONFIG.pressureFormulaFile)
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('config.test.js passed')
