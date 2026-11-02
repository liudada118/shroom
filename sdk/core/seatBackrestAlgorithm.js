'use strict'

// This is the complete delivered kernel, packaged inside the standalone SDK.
const algorithm = require('./seatBackrestPressure_v2.11.0.js')
const { createSensorSession } = require('./seatBackrestSession')

module.exports = { ...algorithm, createSensorSession }
