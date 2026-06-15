'use strict'

const assert = require('assert')
const serial = require('../node/serial')

function run() {
  const ports = [
    { path: 'COM1', manufacturer: 'wch.cn' },
    { path: 'COM2', manufacturer: 'Other' },
    { path: '/dev/cu.usbserial-1', manufacturer: '' },
    { path: '/dev/ttyS0', manufacturer: '' },
  ]

  assert.deepStrictEqual(
    serial.filterSerialPorts(ports, 'win32').map((port) => port.path),
    ['COM1']
  )
  assert.deepStrictEqual(
    serial.filterSerialPorts(ports, 'darwin').map((port) => port.path),
    ['/dev/cu.usbserial-1']
  )
  assert.deepStrictEqual(
    serial.filterSerialPorts(ports, 'linux').map((port) => port.path),
    ['COM1', 'COM2', '/dev/cu.usbserial-1', '/dev/ttyS0']
  )

  assert.strictEqual(serial.isPortBusyError(new Error('Access denied')), true)
  assert.strictEqual(serial.isPortBusyError(new Error('already open')), true)
  assert.strictEqual(serial.isPortBusyError(new Error('random failure')), false)

  assert.deepStrictEqual(serial.DEFAULT_BAUD_CANDIDATES, [921600, 1000000, 3000000])
  assert.strictEqual(serial.DEFAULT_BAUD_DEVICE_MAP[3000000], 'foot')
  assert(serial.VALID_FRAME_LENGTHS.includes(4097))
}

run()
console.log('serial.test.js passed')
