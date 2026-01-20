#!/usr/bin/env node
/**
 * Migrate relative imports/exports to ESM-friendly style by adding file extensions.
 * - Applies to src/server, src/shared, src/specification
 * - For paths like './foo' or '../bar', appends '.js' or '/index.js' depending on filesystem
 */
const fs = require('fs')
const path = require('path')

const roots = [
  path.join(__dirname, '..', 'src', 'server'),
  path.join(__dirname, '..', 'src', 'shared'),
  path.join(__dirname, '..', 'src', 'specification'),
]

const fileRegex = /\.(ts|mts|tsx|js|mjs)$/i
const importRegex = /(import\s+[^'";]+from\s+|export\s+\*\s+from\s+|export\s+\{[^}]*\}\s+from\s+)(["'])([^"']+)(["'])/g

function isDir(p) {
  try {
    return fs.existsSync(p) && fs.lstatSync(p).isDirectory()
  } catch {
    return false
  }
}
function isFile(p) {
  try {
    return fs.existsSync(p) && fs.lstatSync(p).isFile()
  } catch {
    return false
  }
}
function resolveTsCandidate(baseFile, spec) {
  const baseDir = path.dirname(baseFile)
  const abs = path.resolve(baseDir, spec)
  // Try file.ts
  if (isFile(abs + '.ts') || isFile(abs + '.mts')) return { type: 'file', jsSpec: spec + '.js' }
  // Try index.ts in directory
  if (isDir(abs) && (isFile(path.join(abs, 'index.ts')) || isFile(path.join(abs, 'index.mts')))) {
    return { type: 'index', jsSpec: spec.replace(/\/$/, '') + '/index.js' }
  }
  return null
}

function transform(content, filePath) {
  return content.replace(importRegex, (m, pre, quote1, spec, quote2) => {
    // Only adjust relative imports
    if (!(spec.startsWith('./') || spec.startsWith('../'))) return m
    // If spec already has extension, leave it
    if (/\.[a-zA-Z0-9]+$/.test(spec)) return m
    const candidate = resolveTsCandidate(filePath, spec)
    if (candidate) {
      return pre + quote1 + candidate.jsSpec + quote2
    }
    return m
  })
}

function processFile(file) {
  const content = fs.readFileSync(file, 'utf8')
  const updated = transform(content, file)
  if (updated !== content) {
    fs.writeFileSync(file, updated, 'utf8')
    console.log('UPDATED', file)
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (fs.lstatSync(full).isDirectory()) {
      walk(full)
    } else if (fileRegex.test(full)) {
      processFile(full)
    }
  }
}

for (const root of roots) {
  if (fs.existsSync(root)) walk(root)
}

console.log('ESM import migration completed')
