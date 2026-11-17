// All frames now reach 2D, downloads and this model in the same canonical
// display coordinates. Keep car上海's model mapping; never compensate a source
// orientation here, or the model will disagree with 2D and exported selections.
export function prepareChairModelAdc(values, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return []
  if (!Array.isArray(values) || values.length !== width * height) return Array(width * height).fill(null)
  return Array.from({ length: values.length }, (_, index) => {
    const row = Math.floor(index / width)
    const column = index % width
    const sourceRow = height - 1 - row
    // Other model surfaces retain their existing coordinate mapping.
    return values[sourceRow * width + width - 1 - column]
  })
}
