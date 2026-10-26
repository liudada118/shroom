/** Convert an already calculated average pressure and total contact area to force. */
function calculateAreaForceN(averagePressureKpa, areaCm2) {
  if (!Number.isFinite(averagePressureKpa) || averagePressureKpa < 0
    || !Number.isFinite(areaCm2) || areaCm2 < 0) return null
  const force = averagePressureKpa * areaCm2 * 0.1
  return Number.isFinite(force) ? force : null
}

module.exports = { calculateAreaForceN }
