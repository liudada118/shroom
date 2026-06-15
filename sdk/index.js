'use strict'

const matrix = require('./core/matrix')
const selection = require('./core/selection')
const playback = require('./core/playback')
const pressure = require('./core/pressure')
const apiClient = require('./api-client')
const serial = require('./node/serial')
const protocol = require('./node/protocol')
const deviceCache = require('./node/device-cache')
const auth = require('./node/auth')
const config = require('./node/config')
const collector = require('./node/collector')
const historyStore = require('./node/history-store')
const exporter = require('./node/exporter')

module.exports = {
  ...matrix,
  ...selection,
  ...playback,
  ...pressure,
  ...protocol,
  ...deviceCache,
  ...auth,
  ...config,
  ...collector,
  ...historyStore,
  ...exporter,
  matrix,
  selection,
  playback,
  pressure,
  serial,
  protocol,
  deviceCache,
  auth,
  config,
  collector,
  historyStore,
  exporter,
  apiClient,
  ShroomSeatApiClient: apiClient.ShroomSeatApiClient,
  createShroomSeatApiClient: apiClient.createShroomSeatApiClient,
  ShroomSdkError: apiClient.ShroomSdkError,
}
