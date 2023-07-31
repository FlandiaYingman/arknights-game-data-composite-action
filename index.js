const core = require('@actions/core')
const glob = require('@actions/glob')
const path = require('path')
const fs = require('fs/promises')
const { simpleGit } = require('simple-git')

function isObject(obj) {
  return obj === Object(obj)
}

function compositeOnto(origin, dest) {
  for (const key of Object.keys(origin)) {
    if (key in dest && isObject(origin[key]) && isObject(dest[key])) {
      compositeOnto(origin[key], dest[key])
    } else {
      dest[key] = origin[key]
    }
  }
}

function slash(path) {
  const isExtendedLengthPath = path.startsWith('\\\\?\\')
  if (isExtendedLengthPath) {
    return path
  }
  return path.replace(/\\/g, '/')
}

async function relativeGlob(base, patterns) {
  return await glob
    .create(patterns.map((file) => path.join(base, file)).join('\n'))
    .then((globber) => globber.glob())
    .then((files) => files.map((file) => slash(path.relative(base, file))))
}

async function gitExists(git, rev, file) {
  try {
    await git.catFile(['-e', `${rev}:${file}`])
  } catch {
    return false
  }
  return true
}

async function gitShowJSON(git, rev, file) {
  try {
    return JSON.parse(await git.show(`${rev}:${file}`))
  } catch (e) {
    // The file was deleted in the commit represented by this log, or,
    // the text of the file isn't valid JSON.
    // In such cases, simply ignore them.
    console.debug(e)
    return {}
  }
}

async function composite(workspace, origin, dest, trackingFiles) {
  const gitConfig = ['user.name=TexasBot_v1', 'user.email=@']
  const gitOrigin = simpleGit(path.join(workspace, origin), { config: gitConfig })
  const gitDest = simpleGit(path.join(workspace, dest), { config: gitConfig })

  const originLogs = (await gitOrigin.log(['--name-only', '--', ...trackingFiles])).all
  const destLogs = (await gitDest.log(['--name-only', '--'])).all

  const compositedLogsHash = new Set(destLogs.map((log) => log.body.trim()))
  const compositingLogs = originLogs.filter((log) => !compositedLogsHash.has(log.hash)).reverse()

  const destObjectCache = {}
  for (const [i, log] of compositingLogs.entries()) {
    console.log(`Compositing ${log.message} (${log.hash}) onto destination... ${i} of ${compositingLogs.length}`)
    await Promise.all(
      log.diff.files
        .map((file) => file.file)
        .map(async function compositeFile(file) {
          const originObject = await gitShowJSON(gitOrigin, log.hash, file)
          const destObject = await (async () => {
            if (!(file in destObjectCache)) {
              if (await gitExists(gitDest, 'HEAD', file)) {
                destObjectCache[file] = await gitShowJSON(gitDest, 'HEAD', file)
              } else {
                destObjectCache[file] = {}
              }
            }
            return destObjectCache[file]
          })()

          compositeOnto(originObject, destObject)

          const destObjectPath = path.join(workspace, dest, file)
          await fs.mkdir(path.dirname(destObjectPath), { recursive: true })
          await fs.writeFile(destObjectPath, JSON.stringify(destObject, null, 2))
        }),
    )
    await gitDest.add('.')
    await gitDest.commit(`${log.message}\n\n${log.hash}`, { '--date': log.date, '--allow-empty': null })
  }
}

if (require.main === module) {
  ;(async () => {
    try {
      const workspace = process.env['GITHUB_WORKSPACE']
      const trackingFilesPattern = core.getMultilineInput('tracking-files')
      const origin = core.getInput('origin')
      const dest = core.getInput('dest')
      const trackingFiles = await relativeGlob(path.join(workspace, origin), trackingFilesPattern)

      await composite(workspace, origin, dest, trackingFiles)
    } catch (error) {
      core.setFailed(error.stack)
    }
  })()
}

exports.composite = composite
