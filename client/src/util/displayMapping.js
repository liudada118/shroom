export function getColorLimit(color) {
  const value = Number(color);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function getDisplayColorValue(value, colorLimit) {
  const pointValue = Number(value);
  const limit = getColorLimit(colorLimit);

  if (!Number.isFinite(pointValue) || pointValue <= 0) return 0;
  return Math.min(pointValue, limit);
}

export function shouldHideDisplayPoint(value, filter) {
  const pointValue = Number(value);
  const threshold = Number(filter);

  if (!Number.isFinite(pointValue)) return true;
  if (!Number.isFinite(threshold) || threshold <= 0) return false;
  return pointValue < threshold;
}
