export function buildFallbackParams(payload = {}) {
  const params = {}

  Object.keys(payload).forEach((key) => {
    const value = payload[key]
    if (value === undefined || value === null || value === '') {
      return
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      params[key] = value
      return
    }

    params[key] = JSON.stringify(value)
  })

  return params
}
