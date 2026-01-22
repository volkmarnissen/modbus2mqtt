#!/usr/bin/env node

import fs from 'fs'
import path from 'path'

const workspaceRoot = process.cwd()
const targets = [
  'backend/src',
  'backend/tests',
]

const exts = new Set(['.ts', '.tsx', '.mts'])

/** Recursively collect files matching extensions */
function collectFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      out = collectFiles(p, out)
    } else {
      const ext = path.extname(e.name)
      if (exts.has(ext)) out.push(p)
    }
  }
  return out
}

function hasExtension(spec) {
  return /\.(js|cjs|mjs|json|jsx|ts|tsx|css|scss|wasm)(\?|#|$)/.test(spec)
}

function transformSpecifier(spec) {
  if (!spec.startsWith('.')) return spec
  if (hasExtension(spec)) return spec
  if (spec.endsWith('/specification')) return spec + '/index.js'
  // Avoid turning trailing slash into ".js" on a folder
  if (spec.endsWith('/')) return spec + 'index.js'
  return spec + '.js'
}

function rewriteImports(content) {
  let changed = false

  // from-imports and re-exports: ... from '...'
  content = content.replace(/(from\s+)(["'])(\.[^"']+)(\2)/g, (m, p1, q, spec, q2) => {
    const nspec = transformSpecifier(spec)
    if (nspec !== spec) changed = true
    return p1 + q + nspec + q2
  })

  // side-effect imports: import '...'
  content = content.replace(/(import\s+)(["'])(\.[^"']+)(\2)/g, (m, p1, q, spec, q2) => {
    // Ignore "import type { ... } from ..." which is handled above
    if (/\bfrom\b/.test(m)) return m
    const nspec = transformSpecifier(spec)
    if (nspec !== spec) changed = true
    return p1 + q + nspec + q2
  })

  // dynamic imports: import('...')
  content = content.replace(/(import\(\s*)(["'])(\.[^"']+)(\2)(\s*\))/g, (m, p1, q, spec, q2, p3) => {
    const nspec = transformSpecifier(spec)
    if (nspec !== spec) changed = true
    return p1 + q + nspec + q2 + p3
  })

  return { content, changed }
}

let fileCount = 0
let changeCount = 0
const changedFiles = []

for (const rel of targets) {
  const abs = path.join(workspaceRoot, rel)
  const files = collectFiles(abs)
  for (const f of files) {
    const orig = fs.readFileSync(f, 'utf8')
    const { content, changed } = rewriteImports(orig)
    fileCount++
    if (changed) {
      fs.writeFileSync(f, content, 'utf8')
      changeCount++
      changedFiles.push(path.relative(workspaceRoot, f))
    }
  }
}

if (changedFiles.length) {
  console.log(`Updated ${changeCount}/${fileCount} files. Modified:`)
  for (const f of changedFiles) console.log('  -', f)
} else {
  console.log(`No changes needed. Scanned ${fileCount} files.`)
}
