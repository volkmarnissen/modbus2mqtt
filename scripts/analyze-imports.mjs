#!/usr/bin/env node
// Analyze TS/TSX/MTS import specifiers to suggest alias mappings.
// Dry-run by default: prints findings, no modifications.

import { promises as fs } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

const INCLUDE_DIRS = [
  'backend/tests',
]
const EXCLUDE_DIRS = new Set([
  'node_modules',
  'dist',
  'distprod',
  '.git',
  '.vscode',
  '.idea',
  'coverage',
])

const EXTS = ['.ts', '.tsx', '.mts']

const IMPORT_RE = /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/g

/** @typedef {{file:string, spec:string, absTarget?:string, domain:string, relWithinDomain?:string}} ImportRef */

async function listFiles(dir) {
  const out = []
  async function walk(absDir) {
    const entries = await fs.readdir(absDir, { withFileTypes: true })
    for (const ent of entries) {
      const name = ent.name
      if (EXCLUDE_DIRS.has(name)) continue
      const abs = path.join(absDir, name)
      if (ent.isDirectory()) {
        await walk(abs)
      } else {
        if (EXTS.includes(path.extname(name))) out.push(abs)
      }
    }
  }
  await walk(dir)
  return out
}

function detectDomain(fileAbs) {
  const rel = path.relative(repoRoot, fileAbs)
  if (rel.startsWith('backend/src/')) return { domain: 'backend:src', root: path.join(repoRoot, 'backend/src') }
  if (rel.startsWith('backend/tests/')) return { domain: 'backend:tests', root: path.join(repoRoot, 'backend/tests') }
  if (rel.startsWith('frontend/src/')) return { domain: 'frontend:src', root: path.join(repoRoot, 'frontend/src') }
  return null
}

async function readFile(file) {
  return fs.readFile(file, 'utf8')
}

function tryResolveImport(fileAbs, spec) {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return undefined
  const base = path.dirname(fileAbs)
  const candidate = path.resolve(base, spec)
  // We don't need exact file existence; for mapping we want the path within domain.
  return candidate
}

/** @returns {Promise<ImportRef[]>} */
async function collectImports() {
  const all = []
  for (const dir of INCLUDE_DIRS) {
    const abs = path.join(repoRoot, dir)
    try {
      const files = await listFiles(abs)
      for (const f of files) {
        const domainInfo = detectDomain(f)
        if (!domainInfo) continue
        const content = await readFile(f)
        IMPORT_RE.lastIndex = 0
        let m
        while ((m = IMPORT_RE.exec(content))) {
          const spec = m[1]
          const absTarget = tryResolveImport(f, spec)
          /** @type {ImportRef} */
          const rec = { file: f, spec, absTarget, domain: domainInfo.domain }
          if (absTarget) {
            const rel = path.relative(domainInfo.root, absTarget)
            if (!rel.startsWith('..')) rec.relWithinDomain = rel.replaceAll('\\', '/')
          }
          all.push(rec)
        }
      }
    } catch (e) {
      // skip missing dirs
    }
  }
  return all
}

function summarize(imports) {
  /** @type {Record<string, Record<string, number>>} */
  const byDomainBase = {}
  /** @type {Record<string, Set<string>>} */
  const examples = {}
  for (const imp of imports) {
    if (!imp.relWithinDomain) continue
    const domain = imp.domain
    const parts = imp.relWithinDomain.split('/')
    const baseKey = parts.slice(0, parts[0] === '' ? 2 : 1).join('/')
    const key = `${domain}::${baseKey}`
    byDomainBase[domain] ||= {}
    byDomainBase[domain][baseKey] ||= 0
    byDomainBase[domain][baseKey]++
    examples[key] ||= new Set()
    if (examples[key].size < 5) examples[key].add(`${path.relative(repoRoot, imp.file)} -> ${imp.spec}`)
  }
  return { byDomainBase, examples }
}

function printSummary(summary) {
  const domains = Object.keys(summary.byDomainBase)
  for (const domain of domains) {
    console.log(`\n== Domain: ${domain} ==`)
    const entries = Object.entries(summary.byDomainBase[domain]).sort((a, b) => b[1] - a[1])
    for (const [base, count] of entries) {
      const key = `${domain}::${base}`
      console.log(`  ${base.padEnd(24)} ${String(count).padStart(5)} uses`)
      for (const ex of summary.examples[key] || []) {
        console.log(`    e.g. ${ex}`)
      }
    }
  }
}

function suggestAliases(summary) {
  // Heuristic suggestions per domain
  /** @type {Record<string, Record<string, string>>} */
  const suggestions = {}
  for (const domain of Object.keys(summary.byDomainBase)) {
    const entries = Object.entries(summary.byDomainBase[domain]).sort((a, b) => b[1] - a[1])
    suggestions[domain] = {}
    for (const [base] of entries) {
      let alias
      if (domain.startsWith('backend')) {
        if (base === 'server') alias = '@server/*'
        else if (base === 'shared') alias = '@shared/*'
        else if (base === 'specification') alias = '@spec/*'
        else alias = `@${base.replace(/[^a-zA-Z0-9]/g, '')}/*`
      } else if (domain === 'frontend:src') {
        if (base === 'app') alias = '@app/*'
        else if (base === 'shared') alias = '@shared/*'
        else alias = `@fe-${base.replace(/[^a-zA-Z0-9]/g, '')}/*`
      } else {
        alias = `@${base.replace(/[^a-zA-Z0-9]/g, '')}/*`
      }
      suggestions[domain][base] = alias
    }
  }
  console.log('\n== Suggested alias keys (heuristic) ==')
  for (const domain of Object.keys(suggestions)) {
    console.log(`\n${domain}:`)
    for (const [base, alias] of Object.entries(suggestions[domain])) {
      console.log(`  ${base} -> ${alias}`)
    }
  }
}

async function main() {
  const imports = await collectImports()
  // Focus only on relative imports inside domain; ignore bare packages
  const rels = imports.filter((i) => i.relWithinDomain)
  const summary = summarize(rels)
  printSummary(summary)
  suggestAliases(summary)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
