#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, basename, extname } from 'node:path'

const REPO_ROOT = process.cwd()
const VITEST_CONFIG = 'vitest.config.ts'
const TARGET = '__tests__/server/config-dir/modbus2mqtt/specifications/waterleveltransmitter.yaml'

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts })
  return res
}

function runShow(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  return res
}

function restoreTarget() {
  run('git', ['restore', '--staged', '--', TARGET])
  run('git', ['restore', '--', TARGET])
}

function isTargetDirty() {
  const r = run('git', ['status', '--porcelain', '--', TARGET])
  return (r.stdout?.toString() || '').trim().length > 0
}

function printDiff() {
  runShow('git', ['--no-pager', 'diff', '--', TARGET])
}

function listTestFiles(pattern) {
  // If pattern is a file path use it directly
  try {
    const st = run('test', ['-f', pattern])
    // 'test' is shell builtin; using spawnSync 'test' is not portable.
  } catch {}
  const fileRun = run('bash', [
    '-lc',
    `if [ -f "${pattern}" ]; then echo "${pattern}"; else find __tests__ -type f -name "${pattern}" | sort; fi`,
  ])
  const out = fileRun.stdout?.toString().trim()
  return out ? out.split(/\n+/).filter(Boolean) : []
}

function runVitestOn(file) {
  const r = run('npx', ['vitest', '-c', VITEST_CONFIG, '--run', file], { cwd: REPO_ROOT })
  return r.status === 0
}

function extractTestTitles(filePath) {
  const s = readFileSync(filePath, 'utf8')
  const titles = []
  const re = /^[\t ]*(it|test)\s*\(\s*(["'])([^\n\r]*?)\2/gm
  let m
  while ((m = re.exec(s)) !== null) {
    const title = m[3].trim()
    if (title) titles.push(title)
  }
  return titles
}

function makeSingleTestTemp(filePath, title) {
  const dir = dirname(filePath)
  const base = basename(filePath, extname(filePath))
  // Ensure filename matches vitest include pattern *_test.tsx
  const tmpName = `${base}__single__${Date.now()}_test.tsx`
  const dst = join(dir, tmpName)
  const src = readFileSync(filePath, 'utf8')
  // Skip all tests initially
  let out = src.replace(/^(\s*)(it|test)\s*\(/gm, (m, p1, p2) => `${p1}${p2}.skip(`)
  // Enable only the targeted title
  const esc = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp('^(\\s*)(it|test)\\s*\\(\\s*("' + esc + '"|' + "'" + esc + "')", 'm')
  out = out.replace(re, (m, p1, p2) => `${p1}${p2}.only(`)
  writeFileSync(dst, out)
  return dst
}

function deleteFile(file) {
  try {
    rmSync(file, { force: true })
  } catch {}
}

// Track created temp files for cleanup on exit/interrupt
const TEMP_TRACK = new Set()
function trackTemp(file) {
  TEMP_TRACK.add(file)
}
function cleanupTrackedTemps() {
  for (const f of TEMP_TRACK) deleteFile(f)
  TEMP_TRACK.clear()
}
process.on('exit', cleanupTrackedTemps)
process.on('SIGINT', () => {
  cleanupTrackedTemps()
  process.exit(130)
})
process.on('SIGTERM', () => {
  cleanupTrackedTemps()
  process.exit(143)
})

// Remove stale temp tests from previous aborted runs for this file's directory
function cleanupStaleTempsFor(filePath) {
  try {
    const dir = dirname(filePath)
    const base = basename(filePath, extname(filePath))
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
      if (!e.isFile()) continue
      const name = e.name
      if (name.startsWith(`${base}__single__`) && name.endsWith(`_test.tsx`)) {
        deleteFile(join(dir, name))
      }
    }
  } catch {}
}

function parseArgs(argv) {
  let showDiffFlag = false
  let pattern = '*_test.tsx'
  const args = argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '-d' || a === '--diff') showDiffFlag = true
    else if (!a.startsWith('-')) pattern = a
  }
  return { showDiff: showDiffFlag, pattern }
}

function main() {
  const { showDiff, pattern } = parseArgs(process.argv)
  const files = listTestFiles(pattern)
  if (!files.length) {
    console.error(`No test files matched pattern: ${pattern}`)
    process.exit(1)
  }
  console.log(`Scanning ${files.length} tests for mutations to ${TARGET}`)
  const offenders = []
  for (const f of files) {
    console.log(`\n=== Running: ${f} ===`)
    restoreTarget()
    if (isTargetDirty()) restoreTarget()
    const ok = runVitestOn(f)
    if (!ok) console.log(`Test failed: ${f} (continuing to check for mutation)`)
    if (isTargetDirty()) {
      console.log(`MUTATION DETECTED by ${f}`)
      const status = run('git', ['status', '--porcelain', '--', TARGET]).stdout?.toString().trim()
      if (status) console.log(`Status:  ${status}`)
      if (showDiff) {
        console.log('Diff:')
        printDiff()
      }
      offenders.push(f)
      restoreTarget()
    } else {
      console.log(`No mutation by ${f}`)
    }
  }
  console.log(`\nSummary:`)
  if (!offenders.length) {
    console.log(`No mutating tests detected for ${TARGET}`)
  } else {
    console.log(`Mutating tests (${offenders.length}):`)
    for (const o of offenders) console.log(` - ${o}`)
  }

  // Per-test scan if single file pattern and mutation detected
  if (offenders.length === 1 && files.length === 1 && files[0] === offenders[0] && files.length === 1) {
    const file = files[0]
    console.log(`\nMutation detected in file '${file}'. Scanning individual tests in the file...`)
    restoreTarget()
    // Clean stale temp test files before starting
    cleanupStaleTempsFor(file)
    const titles = extractTestTitles(file)
    if (!titles.length) {
      console.log(`No individual test names found in ${file}`)
      process.exit(0)
    }
    const perOffenders = []
    for (const t of titles) {
      console.log(`\n--- Running single test: ${t} ---`)
      restoreTarget()
      const tmp = makeSingleTestTemp(file, t)
      trackTemp(tmp)
      let ok2 = false
      try {
        ok2 = runVitestOn(tmp)
      } finally {
        deleteFile(tmp)
        TEMP_TRACK.delete(tmp)
      }
      if (!ok2) console.log(`Fallback run failed for: ${t}`)
      if (isTargetDirty()) {
        console.log(`MUTATION DETECTED by test: ${t}`)
        const status = run('git', ['status', '--porcelain', '--', TARGET]).stdout?.toString().trim()
        if (status) console.log(`Status:  ${status}`)
        if (showDiff) {
          console.log('Diff:')
          printDiff()
        }
        perOffenders.push(`${file} :: ${t}`)
        restoreTarget()
      } else {
        console.log(`No mutation by test: ${t}`)
      }
    }
    // Final cleanup sweep in case of leftovers
    cleanupStaleTempsFor(file)
    console.log(`\nPer-test Summary:`)
    if (!perOffenders.length) {
      console.log(`No mutating individual tests detected in ${file}`)
    } else {
      console.log(`Mutating individual tests (${perOffenders.length}):`)
      for (const o of perOffenders) console.log(` - ${o}`)
    }
  }
}

main()
