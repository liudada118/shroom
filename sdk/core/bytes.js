'use strict'

function bytes4ToFloat32LE(bytes) {
  const values = Array.from(bytes || [])
  const result = []
  for (let i = 0; i < Math.floor(values.length / 4); i += 1) {
    const buffer = new ArrayBuffer(4)
    const view = new DataView(buffer)
    for (let j = 0; j < 4; j += 1) {
      view.setUint8(j, values[i * 4 + j])
    }
    result.push(view.getFloat32(0, true))
  }
  return result
}

module.exports = {
  bytes4ToFloat32LE,
  bytes4ToInt10: bytes4ToFloat32LE,
}
