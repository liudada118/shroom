const fs = require('fs')
const { decryptStr } = require('./aes_ecb')

function extractFirstJsonObject(text) {
  const source = String(text || '').trim()
  if (!source) {
    throw new Error('Empty system config')
  }

  try {
    return JSON.parse(source)
  } catch (err) {
    // AES decrypt can leave padding/control bytes when the encrypted file has
    // trailing whitespace. Extract the first complete JSON object defensively.
  }

  let depth = 0
  let inString = false
  let escaped = false
  let start = -1

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') {
      if (depth === 0) start = i
      depth += 1
      continue
    }

    if (char === '}') {
      depth -= 1
      if (depth === 0 && start >= 0) {
        return JSON.parse(source.slice(start, i + 1))
      }
    }
  }

  return JSON.parse(source)
}

function readEncryptedSystemConfig(configPath) {
  const encrypted = fs.readFileSync(configPath, 'utf-8').trim()
  return extractFirstJsonObject(decryptStr(encrypted))
}

module.exports = {
  extractFirstJsonObject,
  readEncryptedSystemConfig,
}
