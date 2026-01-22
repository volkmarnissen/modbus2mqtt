#!/usr/bin/env node
// Validates the npm package content quickly without packing/installing.
// Builds backend first to ensure dist/server exists, then runs npm publish --dry-run --json
// and verifies required files are included.

import { execFileSync } from 'node:child_process'

function runDryRun() {
  try {
    const out = execFileSync('npm', ['publish', '--dry-run', '--json'], { encoding: 'utf-8' })
    return out
  } catch (err) {
    console.error('Package dry-run failed:', err?.message || String(err))
    process.exit(2)
  }
}

function parseJson(output) {
  // npm may print a single JSON object; ensure robust parsing
  try {
    return JSON.parse(output)
  } catch {
    // try last JSON object in output
    const lastBrace = output.lastIndexOf('}')
    const firstBrace = output.indexOf('{')
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const slice = output.slice(firstBrace, lastBrace + 1)
      try {
        return JSON.parse(slice)
      } catch (err) {
        console.error('Failed to parse npm dry-run JSON:', err?.message || String(err))
        process.exit(2)
      }
    }
    console.error('No JSON found in npm dry-run output')
    process.exit(2)
  }
}

function ensureFilesIncluded(files) {
  const required = ['bin/modbus2mqtt', 'dist/server/modbus2mqtt.js']
  const missing = required.filter((f) => !files.includes(f))
  if (missing.length > 0) {
    console.error('Missing required files in package:', missing.join(', '))
    process.exit(2)
  }
  // Ensure frontend build output is included: at least one file under dist/frontend
  const hasFrontend = files.some((f) => typeof f === 'string' && f.startsWith('dist/frontend/'))
  if (!hasFrontend) {
    console.error('Missing frontend build output in package: expected files under dist/frontend/')
    process.exit(2)
  }
}

function main() {
  const output = runDryRun()
  const json = parseJson(output)
  const files = Array.isArray(json?.files) ? json.files.map((f) => (typeof f === 'string' ? f : f.path)) : []
  ensureFilesIncluded(files)
  console.log('Package check OK. Files count:', files.length)
}

main()
