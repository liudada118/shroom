const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..')
const sourceDir = path.join(repoRoot, 'client', 'build')
const targetDir = path.join(repoRoot, 'build')

if (!fs.existsSync(path.join(sourceDir, 'index.html'))) {
  throw new Error(`Client build output not found: ${sourceDir}`)
}

function shouldCopy(sourceFile, targetFile) {
  if (!fs.existsSync(targetFile)) {
    return true
  }

  const sourceStat = fs.statSync(sourceFile)
  const targetStat = fs.statSync(targetFile)

  return sourceStat.size !== targetStat.size || sourceStat.mtimeMs > targetStat.mtimeMs
}

function syncDir(sourcePath, targetPath) {
  fs.mkdirSync(targetPath, { recursive: true })

  for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
    const sourceEntry = path.join(sourcePath, entry.name)
    const targetEntry = path.join(targetPath, entry.name)

    if (entry.isDirectory()) {
      syncDir(sourceEntry, targetEntry)
      continue
    }

    if (!shouldCopy(sourceEntry, targetEntry)) {
      continue
    }

    try {
      fs.copyFileSync(sourceEntry, targetEntry)
    } catch (error) {
      if (error.code === 'EPERM' && fs.existsSync(targetEntry)) {
        const sourceStat = fs.statSync(sourceEntry)
        const targetStat = fs.statSync(targetEntry)

        if (sourceStat.size === targetStat.size) {
          console.warn(`[sync-client-build] Skipped locked unchanged file: ${targetEntry}`)
          continue
        }
      }

      throw error
    }
  }
}

syncDir(sourceDir, targetDir)

console.log(`[sync-client-build] Synced ${sourceDir} -> ${targetDir}`)
