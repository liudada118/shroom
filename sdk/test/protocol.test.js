'use strict'

const assert = require('assert')
const protocol = require('../node/protocol')

const rotate = protocol.parseSerialFrame(Buffer.from([0, 0, 0, 0, 128, 63, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
assert.strictEqual(rotate.kind, 'rotate')
assert.deepStrictEqual(rotate.rotate, [1, 0, 0, 0])

const matrix = protocol.parseSerialFrame(Buffer.from([2, ...new Array(1024).fill(1)]))
assert.strictEqual(matrix.kind, 'matrix')
assert.strictEqual(matrix.type, 'car-sit')
assert.strictEqual(matrix.arr.length, 1024)
assert.strictEqual(matrix.validation.valid, true)

const backInput = new Array(1024).fill(1)
const backWithoutLegacyConfig = protocol.transformMatrixByType(backInput, 'endi-back')
const backWithLegacyConfig = protocol.transformMatrixByType(backInput, 'endi-back', { backValueMultiplier: 3 })
assert.deepStrictEqual(backWithLegacyConfig, backWithoutLegacyConfig)
assert.deepStrictEqual(protocol.applyBackMultiplier([106.24], 'endi-back', 3), [106.24])

const mac = protocol.parseSerialFrame(Buffer.from('Unique ID: AABBCCDDEE\nVersion: 1.2.3\n'))
assert.strictEqual(mac.kind, 'mac')
assert.strictEqual(mac.uniqueId, 'AABBCCDDEE')
assert.strictEqual(mac.version, '1.2.3')

const accumulator = protocol.createFrameAccumulator()
const parsed = accumulator.push(Buffer.from([2, ...new Array(1024).fill(2)]))
assert.strictEqual(parsed.type, 'car-sit')
assert.strictEqual(accumulator.state.type, 'car-sit')
assert.strictEqual(accumulator.state.arr.length, 1024)

console.log('protocol.test.js passed')
