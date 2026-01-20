#!/usr/bin/env node
/*
 Phase 1 migration:
 - Move src/server.shared -> src/shared/server
 - Move src/specification.shared -> src/shared/specification
 - Create symlink src/angular/shared -> ../shared
 - Rewrite import paths: 'server.shared/' -> 'shared/server/', 'specification.shared/' -> 'shared/specification/'
*/

const fs = require('fs')
const fsp = fs.promises
const path = require('path')

const repoRoot = path.resolve(__dirname, '..')
const srcDir = path.join(repoRoot, 'src')
const serverShared = path.join(srcDir, 'server.shared')
const specShared = path.join(srcDir, 'specification.shared')
const targetShared = path.join(srcDir, 'shared')
const targetServer = path.join(targetShared, 'server')
const targetSpec = path.join(targetShared, 'specification')
const angularSharedLink = path.join(srcDir, 'angular', 'shared')

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true })
}

async function pathExists(p) {
  try {
    await fsp.lstat(p)
    return true
  } catch {
    return false
  }
}

async function moveDirContents(src, dest) {
  if (!(await pathExists(src))) return
  await ensureDir(dest)
  const entries = await fsp.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      await moveDirContents(from, to)
    } else if (entry.isFile()) {
      await ensureDir(path.dirname(to))
      // If target file exists, keep source by renaming with suffix to avoid overwrite
      if (await pathExists(to)) {
        const { name, ext } = path.parse(to)
        const toAlt = path.join(path.dirname(to), `${name}.migrated${ext}`)
        await fsp.rename(from, toAlt)
        console.log(`RENAMED (conflict): ${from} -> ${toAlt}`)
      } else {
        await fsp.rename(from, to)
        console.log(`MOVED: ${from} -> ${to}`)
      }
    } else {
      // ignore symlinks and others
    }
  }
}

async function removeEmptyDir(dir) {
  if (!(await pathExists(dir))) return
  const entries = await fsp.readdir(dir)
  if (entries.length === 0) {
    await fsp.rmdir(dir)
    console.log(`REMOVED empty dir: ${dir}`)
  } else {
    console.log(`SKIPPED remove (not empty): ${dir}`)
  }
}

function isCodeFile(filename) {
  return /(\.([cm]?ts|tsx|[cm]?js))$/i.test(filename)
}

async function rewriteImportsInFile(filePath) {
  const content = await fsp.readFile(filePath, 'utf8')
  let updated = content

  const angularDir = path.join(srcDir, 'angular')
  const isAngular = filePath.startsWith(angularDir + path.sep)

  const normalizePosix = (p) => p.replace(/\\/g, '/')

  function fixSharedSegments(p) {
    let s = normalizePosix(p)
    // Clean up previously broken patterns
    s = s.replace(/shared\/specificationspecification\.shared/g, 'shared/specification')
    s = s.replace(/shared\/serverserver\.shared/g, 'shared/server')
    s = s.replace(/shared\/specification\.shared/g, 'shared/specification')
    s = s.replace(/shared\/server\.shared/g, 'shared/server')

    // If path doesn't already include shared/specification|server, convert legacy *.shared
    if (!/shared\/(specification|server)(\/?|$)/.test(s)) {
      s = s.replace(/(^|\/)specification\.shared(\/?|$)/, (m, pre, post) => `${pre}shared/specification${post ? '/' : ''}`)
      s = s.replace(/(^|\/)server\.shared(\/?|$)/, (m, pre, post) => `${pre}shared/server${post ? '/' : ''}`)
    }
    return s
  }

  function moveToAngularSymlink(p) {
    // Only adjust relative target to point to src/angular/shared
    const s = normalizePosix(p)
    const needsSpec = /shared\/specification(\/?|$)/.test(s)
    const needsServer = /shared\/server(\/?|$)/.test(s)
    if (!isAngular || (!needsSpec && !needsServer)) return s

    const target = path.join(angularDir, 'shared', needsSpec ? 'specification' : 'server')
    const rel = normalizePosix(path.relative(path.dirname(filePath), target))
    return rel
  }

  function rewriteOnePath(inner) {
    let s = fixSharedSegments(inner)
    s = moveToAngularSymlink(s)
    return s
  }

  // from '...'
  updated = updated.replace(/(from\s+)(['"][^'"]+['"])/g, (m, fromKw, str) => {
    const q = str[0]
    const inner = str.slice(1, -1)
    const replaced = rewriteOnePath(inner)
    return fromKw + q + replaced + q
  })
  // import('...') dynamic
  updated = updated.replace(/(import\s*\(\s*)(['"][^'"]+['"])(\s*\))/g, (m, pre, str, post) => {
    const q = str[0]
    const inner = str.slice(1, -1)
    const replaced = rewriteOnePath(inner)
    return pre + q + replaced + q + post
  })
  // require('...')
  updated = updated.replace(/(require\s*\(\s*)(['"][^'"]+['"])(\s*\))/g, (m, pre, str, post) => {
    const q = str[0]
    const inner = str.slice(1, -1)
    const replaced = rewriteOnePath(inner)
    return pre + q + replaced + q + post
  })

  if (updated !== content) {
    await fsp.writeFile(filePath, updated, 'utf8')
    console.log(`UPDATED imports: ${filePath}`)
  }
}

async function rewriteImportsRecursively(rootDir) {
  const stack = [rootDir]
  while (stack.length) {
    const current = stack.pop()
    const entries = await fsp.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        // skip node_modules & dist
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'distprod') continue
        stack.push(full)
      } else if (entry.isFile() && isCodeFile(entry.name)) {
        await rewriteImportsInFile(full)
      }
    }
  }
}

async function createAngularSharedSymlink() {
  const linkTarget = path.relative(path.join(srcDir, 'angular'), targetShared)
  // Remove existing file/dir if present
  if (await pathExists(angularSharedLink)) {
    const stat = await fsp.lstat(angularSharedLink)
    if (stat.isSymbolicLink() || stat.isFile()) {
      await fsp.unlink(angularSharedLink)
    } else if (stat.isDirectory()) {
      // Try to remove empty directory; otherwise fail
      const files = await fsp.readdir(angularSharedLink)
      if (files.length === 0) await fsp.rmdir(angularSharedLink)
      else throw new Error(`Cannot replace non-empty directory at ${angularSharedLink}`)
    }
  }
  await fsp.symlink(linkTarget, angularSharedLink)
  console.log(`SYMLINK created: ${angularSharedLink} -> ${linkTarget}`)
}

async function main() {
  console.log('== Shared migration start ==')
  await ensureDir(targetShared)
  await ensureDir(targetServer)
  await ensureDir(targetSpec)

  await moveDirContents(serverShared, targetServer)
  await moveDirContents(specShared, targetSpec)

  // Attempt to remove old dirs if empty after move
  await removeEmptyDir(serverShared)
  await removeEmptyDir(specShared)

  // Rewrite imports across src/ and __tests__/
  await rewriteImportsRecursively(srcDir)
  const testsDir = path.join(repoRoot, '__tests__')
  if (await pathExists(testsDir)) {
    await rewriteImportsRecursively(testsDir)
  }

  // Create symlink for frontend
  await createAngularSharedSymlink()

  console.log('== Shared migration done ==')
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
