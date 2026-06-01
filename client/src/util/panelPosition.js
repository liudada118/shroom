function toFiniteNumber(value, fallback = 0) {
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

export function resolvePanelPosition(position = {}, panelSize = {}, viewport = {}) {
  const viewportWidth = toFiniteNumber(viewport.width, 0)
  const viewportHeight = toFiniteNumber(viewport.height, 0)
  const panelWidth = toFiniteNumber(panelSize.width, 0)
  const panelHeight = toFiniteNumber(panelSize.height, 0)

  const x = Number.isFinite(Number(position.right))
    ? viewportWidth - toFiniteNumber(position.right) - panelWidth
    : toFiniteNumber(position.x, 0)

  const y = Number.isFinite(Number(position.bottom))
    ? viewportHeight - toFiniteNumber(position.bottom) - panelHeight
    : toFiniteNumber(position.y, 0)

  return {
    x: Math.max(0, x),
    y: Math.max(0, y),
  }
}
