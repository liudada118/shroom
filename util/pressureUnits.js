// Node 侧镜像：与 client/src/util/pressureMetrics.js 的压强单位部分保持同步。
// util 目录在 Vite root 之外、只能用 CommonJS，故沿用 gradientMetrics 的镜像文件做法。
//
// 内部压强一律以 kPa 计算与存储，只有「显示 / 导出成文件」这一层做换算。
// 1 kPa = 1000 N/m² = 0.1 N/cm²

const PRESSURE_UNIT_N_CM2 = 'N/cm²'
const PRESSURE_UNIT_KPA = 'kPa'
const PRESSURE_UNIT_SEQUENCE = [PRESSURE_UNIT_N_CM2, PRESSURE_UNIT_KPA]
const N_CM2_PER_KPA = 0.1

function normalizePressureUnit(unit) {
  const lower = String(unit || '').trim().toLowerCase()
  if (lower === 'kpa') return PRESSURE_UNIT_KPA
  return PRESSURE_UNIT_N_CM2
}

/** kPa → 目标单位的换算系数 */
function getPressureUnitScale(unit) {
  return normalizePressureUnit(unit) === PRESSURE_UNIT_N_CM2 ? N_CM2_PER_KPA : 1
}

/** N/cm² 数值是 kPa 的 1/10，多留一位小数保持精度等价 */
function getPressureUnitDigits(unit) {
  return normalizePressureUnit(unit) === PRESSURE_UNIT_N_CM2 ? 2 : 1
}

function convertPressureValue(kpaValue, unit) {
  // null / undefined / '' 被 Number() 转成 0，会把空值显示成 0.00，这里先挡掉
  if (kpaValue === null || kpaValue === undefined || kpaValue === '') return null
  const numeric = Number(kpaValue)
  if (!Number.isFinite(numeric)) return null
  return numeric * getPressureUnitScale(unit)
}

function formatPressureValue(kpaValue, unit) {
  const converted = convertPressureValue(kpaValue, unit)
  if (converted === null) return '-'
  return converted.toFixed(getPressureUnitDigits(unit))
}

module.exports = {
  PRESSURE_UNIT_N_CM2,
  PRESSURE_UNIT_KPA,
  PRESSURE_UNIT_SEQUENCE,
  N_CM2_PER_KPA,
  normalizePressureUnit,
  getPressureUnitScale,
  getPressureUnitDigits,
  convertPressureValue,
  formatPressureValue,
}
