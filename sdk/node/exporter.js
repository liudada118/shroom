'use strict'

const fs = require('fs')
const path = require('path')

function getXlsx(options = {}) {
  if (options.XLSX) return options.XLSX
  try {
    return require('xlsx')
  } catch (err) {
    throw new Error('xlsx is required for XLSX export functions')
  }
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function csvEscape(value) {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function normalizeFrameData(frame) {
  if (!frame) return {}
  if (frame.data && typeof frame.data === 'object') return frame.data
  if (typeof frame.data === 'string') {
    try {
      return JSON.parse(frame.data)
    } catch {
      return {}
    }
  }
  return frame
}

function getFrameTimestamp(frame, index) {
  return frame.timestamp || frame.rawFrame?.received_at || frame.data?.rawFrame?.received_at || index
}

function flattenFrameRows(frames = [], options = {}) {
  const includeZeroValues = Boolean(options.includeZeroValues)
  const rows = []

  frames.forEach((frame, frameIndex) => {
    const data = normalizeFrameData(frame)
    const timestamp = getFrameTimestamp(frame, frameIndex)
    const recordName = frame.date || frame.recordName || options.recordName || ''

    if (data.kind === 'matrix' && Array.isArray(data.arr)) {
      data.arr.forEach((value, pointIndex) => {
        const numeric = Number(value) || 0
        if (!includeZeroValues && numeric === 0) return
        rows.push({
          record_name: recordName,
          frame_index: frameIndex,
          timestamp,
          matrix_key: data.type || frame.type || '',
          point_index: pointIndex,
          value: numeric,
          kind: data.kind,
          port: data.rawFrame?.port || frame.path || '',
          baud_rate: data.rawFrame?.baud_rate || frame.baudRate || '',
        })
      })
      return
    }

    Object.keys(data || {}).forEach((matrixKey) => {
      const item = data[matrixKey]
      if (!item || !Array.isArray(item.arr)) return
      item.arr.forEach((value, pointIndex) => {
        const numeric = Number(value) || 0
        if (!includeZeroValues && numeric === 0) return
        rows.push({
          record_name: recordName,
          frame_index: frameIndex,
          timestamp,
          matrix_key: matrixKey,
          point_index: pointIndex,
          value: numeric,
          kind: 'matrix',
          port: item.rawFrame?.port || frame.path || '',
          baud_rate: item.rawFrame?.baud_rate || frame.baudRate || '',
        })
      })
    })
  })

  return rows
}

function inferHeaders(rows = []) {
  const seen = new Set()
  rows.forEach((row) => {
    Object.keys(row || {}).forEach((key) => seen.add(key))
  })
  return Array.from(seen)
}

function exportRowsToCsv(filePath, rows = [], headers = inferHeaders(rows)) {
  ensureDir(filePath)
  const lines = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row?.[header])).join(',')),
  ]
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8')
  return { filePath, rowCount: rows.length, headers }
}

function exportRowsToXlsx(filePath, rows = [], options = {}) {
  ensureDir(filePath)
  const XLSX = getXlsx(options)
  const headers = options.headers || inferHeaders(rows)
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, options.sheetName || 'frames')
  XLSX.writeFile(workbook, filePath)
  return { filePath, rowCount: rows.length, headers }
}

function exportFrames(filePath, frames = [], options = {}) {
  const rows = options.rows || flattenFrameRows(frames, options)
  const format = String(options.format || path.extname(filePath).slice(1) || 'csv').toLowerCase()
  if (format === 'xlsx' || format === 'xls') return exportRowsToXlsx(filePath, rows, options)
  return exportRowsToCsv(filePath, rows, options.headers || inferHeaders(rows))
}

module.exports = {
  csvEscape,
  flattenFrameRows,
  inferHeaders,
  exportRowsToCsv,
  exportRowsToXlsx,
  exportFrames,
}
