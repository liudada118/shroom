export interface MatrixDimensions {
  width: number
  height: number
}

export interface DataDirection {
  left?: boolean
  up?: boolean
  rotateDegree?: number
  rotate_degree?: number
  data_direction?: string
  byKey?: Record<string, DataDirection>
}

export interface MatrixItem {
  arr?: number[]
  [key: string]: any
}

export interface ZeroState {
  enabled?: boolean
  zeroTime?: number | null
  data?: Record<string, number[]>
}

export interface SelectionRegion {
  xStart?: number
  xEnd?: number
  yStart?: number
  yEnd?: number
  width?: number
  matrixWidth?: number
  left?: number
  top?: number
  x?: number
  y?: number
  w?: number
  h?: number
  widthCells?: number
  heightCells?: number
  [key: string]: any
}

export interface PressureMetrics {
  activeCount: number
  effectiveArea: number
  rawPress: number
  rawMax: number
  rawAvg: number
  adcAvg?: number
  sensor?: string
  pressMax: number
  pressAver: number
  total: number
}

export const DEFAULT_API_PORT: number
export const DEFAULT_WS_PORT: number
export const DEFAULT_DATA_DIRECTION: DataDirection
export const DEFAULT_SIT_ROTATE_DEGREE: number
export const MATRIX_DIMENSIONS: Record<string, MatrixDimensions>
export const DEFAULT_PRESSURE_FORMULA_PROFILE: string
export const PRESSURE_FORMULA_PROFILES: Record<string, any>

export function normalizeRotateDegree(value: unknown): number
export function getDataDirectionName(direction?: DataDirection): string
export function normalizeDataDirection(direction?: DataDirection): Required<Omit<DataDirection, 'byKey'>> & { byKey?: Record<string, DataDirection> }
export function normalizeDataDirectionState(direction?: DataDirection): DataDirection
export function getDirectionForKey(directionState: DataDirection | undefined, key: string): DataDirection
export function getMatrixDimensions(key: string, arr?: unknown[]): MatrixDimensions | null
export function getDirectedDimensions(key: string, arr: unknown[], direction?: DataDirection): MatrixDimensions | null
export function isValidMatrix(key: string, arr: unknown[]): boolean
export function flipHorizontal<T>(arr: T[], width: number, height: number): T[]
export function flipVertical<T>(arr: T[], width: number, height: number): T[]
export function rotateClockwise<T>(arr: T[], width: number, height: number): T[]
export function applyCollectionDirection<T>(key: string, arr: T[], direction?: DataDirection): T[]
export function applyZeroBaseline(key: string, arr: number[], zeroState?: ZeroState): number[]
export function buildMatrixMeta(key: string, arr: unknown[], direction?: DataDirection): any
export function transformMatrixItem(key: string, item?: MatrixItem, options?: { dataDirection?: DataDirection, zeroState?: ZeroState }): MatrixItem
export function buildDirectedFrame<T extends Record<string, MatrixItem>>(frame?: T, options?: { dataDirection?: DataDirection, zeroState?: ZeroState }): T

export function getMatrixKeyCandidates(key: string, systemType?: string): string[]
export function getSelectionForMatrixKey(selectJson: Record<string, any>, key: string, options?: { systemType?: string }): any
export function getSelectionRegions(selection: any): SelectionRegion[]
export function normalizeRegion(region: SelectionRegion, matrixWidth?: number): Required<Pick<SelectionRegion, 'xStart' | 'xEnd' | 'yStart' | 'yEnd' | 'width'>> | null
export function computeRegionStats(arr: number[], region: SelectionRegion, options?: MatrixDimensions): { press: number, area: number, values: number[] }
export function computeSelectionStats(frame: Record<string, MatrixItem>, selectJson: Record<string, any>, options?: { systemType?: string }): Record<string, { press: number, area: number, regions: Array<{ press: number, area: number, values: number[] }> }>

export function parsePlaybackData(value: unknown): Record<string, any>
export function removePlaybackSelect<T>(data: T): T
export function validatePlaybackFrameData(frame: Record<string, MatrixItem>): { valid: boolean, reason?: string, key?: string, actualLength?: number }
export function parsePlaybackTimestamp(value: unknown): unknown
export function clampFrameIndex(rows?: unknown[], index?: number): number
export function buildPlaybackSnapshot(rows?: any[], index?: number, options?: { validate?: boolean }): any

export function setPressureFormulaProfile(profile: string): string
export function getPressureFormulaProfile(): string
export function getPressureSensor(key: string): string
export function estimatePressure(adcAvg: number, nValid: number, sensor: string): number | null
export function estimateMaxPressure(adcMax: number, nValid: number, sensor: string, adcAvg: number): number | null
export function getPressurePointAreaCm2(key: string): number
export function computePressureMetrics(arr: number[], key: string, options?: { profile?: string, pointAreaCm2?: number }): PressureMetrics

export class ShroomSdkError extends Error {
  code?: number
  data?: any
  result?: any
  status?: number
  response?: any
}

export interface ApiClientOptions {
  baseUrl?: string
  wsUrl?: string
  apiPort?: number
  wsPort?: number
  host?: string
  protocol?: string
  wsHost?: string
  wsProtocol?: string
  fetch?: typeof fetch
  WebSocket?: any
  timeoutMs?: number
  unwrap?: boolean
  throwOnBusinessError?: boolean
  headers?: Record<string, string>
  decodeMessagePack?: (payload: Uint8Array) => any
  messagePack?: { decode?: (payload: Uint8Array) => any }
}

export class ShroomSeatApiClient {
  constructor(options?: ApiClientOptions)
  request(method: string, path: string, options?: any): Promise<any>
  get(path: string, options?: any): Promise<any>
  post(path: string, body?: any, options?: any): Promise<any>
  connectWebSocket(handlers?: Record<string, Function>): any
}

export function createShroomSeatApiClient(options?: ApiClientOptions): ShroomSeatApiClient

export namespace matrix {}
export namespace selection {}
export namespace playback {}
export namespace pressure {}
export namespace apiClient {}

export interface SerialPortInfo {
  path?: string
  comName?: string
  manufacturer?: string
  [key: string]: any
}

export interface SerialFrame {
  path: string
  baudRate: number
  receivedAt: number
  buffer: Buffer
  bytes: number[]
  length: number
}

export interface SerialConnection {
  path: string
  baudRate: number
  deviceClass?: string
  port: any
  parser: any
  onFrame(handler: (frame: SerialFrame) => void): () => void
  readMac(options?: any): Promise<{ uniqueId: string | null, version: string | null, raw: string }>
  close(): Promise<boolean>
}

export class ShroomSerialError extends Error {
  code?: string
  path?: string
  baudRate?: number
  cause?: any
}

export function filterSerialPorts(ports?: SerialPortInfo[], platform?: string): SerialPortInfo[]
export function listSerialPorts(options?: any): Promise<SerialPortInfo[]>
export function listDevicePorts(options?: any): Promise<SerialPortInfo[]>
export function isPortBusyError(error: unknown): boolean
export function tryBaudRate(path: string, baudRate: number, options?: any): Promise<boolean>
export function detectBaudRate(path: string, options?: any): Promise<number | null>
export function openSerialConnection(path: string, baudRate: number, options?: any): Promise<SerialConnection>
export function openSerialConnectionWithRetry(path: string, baudRate: number, options?: any): Promise<SerialConnection>
export function sendMacCommand(port: any, options?: any): Promise<{ uniqueId: string | null, version: string | null, raw: string }>
export function closeSerialConnection(connection: SerialConnection): Promise<boolean>
export function connectSerialPort(portInfoOrPath: string | SerialPortInfo, options?: any): Promise<SerialConnection>
export function connectSerialDevices(options?: any): Promise<{ connections: SerialConnection[], failedPorts: Array<{ path: string, error: any, code: string, message: string }> }>

export namespace serial {}

export interface ParsedSerialFrame {
  kind: string
  type?: string
  typeCode?: number
  arr?: number[]
  sourceArr?: number[]
  rotate?: number
  uniqueId?: string | null
  version?: string | null
  validation?: { valid: boolean, reason?: string, [key: string]: any }
  rawFrame?: Record<string, any>
  [key: string]: any
}

export const ORDER_MAP: Record<number, string>
export const HAND_TYPE_MAP: Record<number, string>
export const TYPE_CONFIG: Record<number, string>
export const MATRIX_POINT_COUNTS: Record<string, number>
export function normalizeBytes(input: unknown): number[]
export function applyBackMultiplier(arr: number[], type: string, multiplier?: number): number[]
export function transformMatrixByType(rawArr: number[], type: string, options?: any): number[]
export function validateMatrixPointCount(type: string, arr: number[]): { valid: boolean, reason?: string, expectedLength?: number, actualLength?: number }
export function parseMacText(buffer: Buffer | number[] | Uint8Array): ParsedSerialFrame | null
export function parseSerialFrame(input: unknown, context?: any): ParsedSerialFrame
export function createFrameAccumulator(initial?: any): { state: any, push(frame: unknown, context?: any): ParsedSerialFrame }
export namespace protocol {}

export function normalizeMac(mac: unknown): string
export function createDeviceCache(options?: any): {
  cachePath: string
  normalizeMac(mac: unknown): string
  readCache(): any
  writeCache(cache: any): any
  get(mac: string): any
  set(mac: string, type: string, deviceClass?: string, alias?: string): any
  remove(mac: string): void
  clear(): any
  getAll(): Record<string, any>
}
export namespace deviceCache {}

export const DEFAULT_BACKEND_ADDRESS: string
export const DEFAULT_TIME_SERVER_ADDRESS: string
export function resolveDeviceTypeOnline(uniqueId: string, options?: any): Promise<any>
export function resolveDeviceTypeLocal(uniqueId: string, options?: any): any
export function resolveDeviceType(uniqueId: string, options?: any): Promise<any>
export namespace auth {}

export const AES_KEY_TEXT: string
export const DEFAULT_PRESSURE_CONFIG: { backValueMultiplier: number, pressureFormulaFile: string, pressureFormulaProfile: string }
export function encryptString(src: string, keyText?: string): string
export function decryptString(encrypted: string, keyText?: string): string
export function extractFirstJsonObject(text: string): any
export function readEncryptedSystemConfig(configPath: string, options?: any): any
export function writeEncryptedSystemConfig(configPath: string, config: any, options?: any): any
export function normalizeFormulaFile(fileName?: string, fallback?: string): string
export function normalizePressureConfig(config?: any): any
export function loadPressureConfig(configPath: string, options?: any): any
export function savePressureConfig(configPath: string, config?: any, options?: any): any
export function listPressureFormulaFiles(formulaDir: string): string[]
export function loadPressureFormula(formulaDir: string, formulaFile: string): any
export namespace config {}

export interface CollectorFrameRecord {
  timestamp: number
  path: string
  baudRate: number | null
  type: string
  kind: string
  data: ParsedSerialFrame
}

export class ShroomCollector {
  constructor(options?: any)
  connectAll(options?: any): Promise<any>
  connectPort(portInfoOrPath: string | SerialPortInfo, options?: any): Promise<SerialConnection>
  registerConnection(connection: SerialConnection): SerialConnection
  readMac(connectionOrPath: SerialConnection | string, options?: any): Promise<any>
  handleRawFrame(frame: SerialFrame, context?: any): CollectorFrameRecord
  pushParsedFrame(parsed: ParsedSerialFrame, context?: any): CollectorFrameRecord
  startRecord(name?: string): string
  stopRecord(): { recordName: string, frames: CollectorFrameRecord[], count: number }
  getFrames(): CollectorFrameRecord[]
  disconnectAll(): Promise<boolean[]>
  on(eventName: string, listener: (...args: any[]) => void): this
  emit(eventName: string, ...args: any[]): boolean
}
export function createCollector(options?: any): ShroomCollector
export function normalizeRecordName(value: unknown): string
export function buildFrameRecord(parsed: ParsedSerialFrame, context?: any): CollectorFrameRecord
export namespace collector {}

export function createHistoryStore(options?: any): Promise<{
  db: any
  dbPath: string
  appendFrame(recordName: string, frame: any, options?: any): Promise<any>
  appendFrames(recordName: string, frames?: any[], options?: any): Promise<any[]>
  listRecords(): Promise<any[]>
  readRecord(recordName: string, options?: any): Promise<any[]>
  getRecordMeta(recordName: string): Promise<any>
  deleteRecord(recordName: string): Promise<any>
  clear(): Promise<any>
  close(): Promise<void>
}>
export function serializeFrameData(frame: any): string
export function parseFrameData(value: any): any
export namespace historyStore {}

export function csvEscape(value: unknown): string
export function flattenFrameRows(frames?: any[], options?: any): any[]
export function inferHeaders(rows?: any[]): string[]
export function exportRowsToCsv(filePath: string, rows?: any[], headers?: string[]): { filePath: string, rowCount: number, headers: string[] }
export function exportRowsToXlsx(filePath: string, rows?: any[], options?: any): { filePath: string, rowCount: number, headers: string[] }
export function exportFrames(filePath: string, frames?: any[], options?: any): { filePath: string, rowCount: number, headers: string[] }
export namespace exporter {}
