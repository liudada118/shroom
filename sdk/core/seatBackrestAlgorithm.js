'use strict'

// This is the complete delivered kernel, packaged inside the standalone SDK.
const { loadSensorAlgorithm, recordAlgorithmResult, createSensorSession } = require('./seatBackrestSession')
const algorithm = loadSensorAlgorithm().api

module.exports = {
  ...algorithm,
  createSensorSession,
  calculateSensorFrame(frame, type, options) {
    return recordAlgorithmResult(algorithm.calculateSensorFrame(frame, type, options), algorithm.VERSION)
  },
  calculateSensorSequence(frames, type, options) {
    return algorithm.calculateSensorSequence(frames, type, options).map((result) => recordAlgorithmResult(result, algorithm.VERSION))
  },
}
