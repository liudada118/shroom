'use strict'

const assert = require('assert')
const { createCollector } = require('../node/collector')
const protocol = require('../node/protocol')

const collector = createCollector({ cache: false })
let matrixEvents = 0
collector.on('matrix', () => {
  matrixEvents += 1
})

const recordName = collector.startRecord('demo')
assert.strictEqual(recordName, 'demo')

const parsed = protocol.parseSerialFrame(Buffer.from([2, ...new Array(1024).fill(3)]), { path: 'COM1', baudRate: 1000000 })
const record = collector.pushParsedFrame(parsed, { path: 'COM1', baudRate: 1000000 })
assert.strictEqual(record.kind, 'matrix')
assert.strictEqual(record.type, 'car-sit')
assert.strictEqual(matrixEvents, 1)
assert.strictEqual(collector.getFrames().length, 1)

const stopped = collector.stopRecord()
assert.strictEqual(stopped.recordName, 'demo')
assert.strictEqual(stopped.count, 1)
assert.strictEqual(collector.getFrames().length, 0)

console.log('collector.test.js passed')
