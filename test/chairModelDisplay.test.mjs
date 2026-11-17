import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { prepareChairModelAdc } from '../client/src/util/chairModelDisplay.js'

const require = createRequire(import.meta.url)
const { endiSit1024 } = require('../util/line.js')
const { buildRawDisplayAdc } = require('../util/fullAlgorithmProcessor.js')

function turnClockwise(values, width) {
  return Array.from({ length: values.length }, (_, index) => {
    const row = Math.floor(index / width)
    const column = index % width
    return values[(width - 1 - column) * width + row]
  })
}

test('the model applies its existing car上海 transform to common display coordinates', () => {
  // Each row is one front-to-rear position; columns retain the model's existing
  // horizontal convention. Distinct corners catch an accidental 180° rotation.
  const source = Object.freeze([
    11, 12, 13, // front edge: left, middle, right
    21, 22, 23, // rear edge: left, middle, right
  ])
  const rendered = prepareChairModelAdc(source, 3, 2, 'endi', 'sit')
  assert.deepEqual(rendered, [23, 22, 21, 13, 12, 11])
  assert.deepEqual(source, [11, 12, 13, 21, 22, 23])
  assert.notEqual(rendered, source)
})

test('one corner contact keeps its ADC amplitude through the model coordinate transform', () => {
  const source = Array(46 * 46).fill(0)
  source[0] = 137.25
  const rendered = prepareChairModelAdc(source, 46, 46, 'endi', 'sit')
  assert.equal(rendered[46 * 46 - 1], 137.25)
  assert.equal(rendered[0], 0)
  assert.equal(rendered.filter(value => value > 0).length, 1)
  assert.equal(source[0], 137.25)
})

test('asymmetric raw seat data exactly matches car上海 serial, display and model orientation', () => {
  const raw = Array.from({ length: 1024 }, (_, index) => (index * 73 + Math.floor(index / 32) * 19) % 251)
  // car上海: legacy serial mapping (includes 180°), then default 270°,
  // then the old model's final row-and-column reversal.
  let baseline = endiSit1024(raw)
  for (let turn = 0; turn < 3; turn++) baseline = turnClockwise(baseline, 46)
  const canonical = buildRawDisplayAdc('endi-sit', { algorithmRawFrame: raw }, 3).flat()
  const original = canonical.slice()
  assert.deepEqual(canonical, baseline)
  assert.deepEqual(prepareChairModelAdc(canonical, 46, 46), baseline.slice().reverse())
  assert.deepEqual(canonical, original)
})

test('rectangular backrest and other seat systems keep their existing orientation', () => {
  const source = [1, 2, 3, 4, 5, 6]
  for (const [system, surface] of [['endi', 'back'], ['carY', 'sit'], ['carY', 'back']]) {
    assert.deepEqual(prepareChairModelAdc(source, 3, 2, system, surface), [6, 5, 4, 3, 2, 1])
  }
})

test('missing samples are not substituted and invalid shapes remain blank', () => {
  assert.deepEqual(prepareChairModelAdc([null, 0.125, 30, 255], 2, 2), [255, 30, 0.125, null])
  assert.deepEqual(prepareChairModelAdc([1], 2, 2, 'endi', 'sit'), [null, null, null, null])
})
