export function isEndiBackVisibleCell(row, col, width = 50, height = 64) {
  const r = Number(row)
  const c = Number(col)
  if (!Number.isFinite(r) || !Number.isFinite(c)) return true
  if (width !== 50 || height !== 64) return true
  if (r < 0 || r >= height || c < 0 || c >= width) return false

  // The top 9 physical rows only have 11 wired columns centered on the backrest.
  // With the current 2x linear interpolation this maps to rows 0..17 and columns 14..34.
  if (r < 18) {
    return c >= 14 && c <= 34
  }

  return true
}

export function isEndiBackVisibleIndex(index, width = 50, height = 64) {
  const i = Number(index)
  if (!Number.isFinite(i) || i < 0) return true
  const row = Math.floor(i / width)
  const col = i % width
  return isEndiBackVisibleCell(row, col, width, height)
}

export function isEndiBackPointVisible(row, col, sourceWidth = 50, sourceHeight = 64) {
  const r = Number(row)
  const c = Number(col)
  if (!Number.isFinite(r) || !Number.isFinite(c)) return true
  if (sourceWidth !== 50 || sourceHeight !== 64) return true
  const sourceRow = Math.floor(r)
  const sourceCol = Math.floor(c)
  return isEndiBackVisibleCell(sourceRow, sourceCol, sourceWidth, sourceHeight)
}
