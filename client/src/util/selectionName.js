import i18n from 'i18next'

const DEFAULT_SELECTION_NAME_PATTERNS = [
  /^框选\s*(\d+)$/,
  /^Selection\s*(\d+)$/i,
]

export function isDefaultSelectionName(name) {
  const text = String(name || '').trim()
  return DEFAULT_SELECTION_NAME_PATTERNS.some(pattern => pattern.test(text))
}

export function getDefaultSelectionName(index, t = i18n.t.bind(i18n)) {
  return t('selectionDefaultName', { index })
}

export function formatSelectionName(name, index, t = i18n.t.bind(i18n)) {
  const text = String(name || '').trim()
  if (!text || isDefaultSelectionName(text)) {
    return getDefaultSelectionName(index, t)
  }
  return text
}
