import { normalizeVisualColorSetting } from './visualSettingStorage'

export function getColorLimit(color) {
  return normalizeVisualColorSetting(color);
}

export function getDisplayColorValue(value, colorLimit) {
  const pointValue = Number(value);
  const limit = getColorLimit(colorLimit);

  if (!Number.isFinite(pointValue) || pointValue <= 0) return 0;
  return Math.min(pointValue, limit);
}

export function shouldHideDisplayPoint(value, filter) {
  const pointValue = Number(value);
  if (!Number.isFinite(pointValue)) return true;
  const filterValue = Number(filter);
  return Number.isFinite(filterValue) && filterValue > 0 && pointValue < filterValue;
}
