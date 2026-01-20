#!/usr/bin/env node
import { ESLint } from 'eslint'

async function main() {
  const eslint = new ESLint({ cwd: process.cwd(), overrideConfig: { ignores: ['src/angular/**'] } })

  // Lint only src, exclude Angular subfolder explicitly
  const results = await eslint.lintFiles(["src/**/*.{ts,tsx,js,jsx}"])

  const anyFindings = []
  for (const res of results) {
    for (const msg of res.messages) {
      if (msg.ruleId === '@typescript-eslint/no-explicit-any' || msg.ruleId === 'no-explicit-any') {
        anyFindings.push({
          filePath: res.filePath,
          line: msg.line,
          column: msg.column,
          message: msg.message,
        })
      }
    }
  }

  if (anyFindings.length === 0) {
    console.log('No any occurrences reported by ESLint.')
    return
  }

  // Group by file for a concise report
  const byFile = new Map()
  for (const f of anyFindings) {
    const arr = byFile.get(f.filePath) || []
    arr.push(f)
    byFile.set(f.filePath, arr)
  }

  for (const [file, items] of byFile.entries()) {
    console.log(`\n${file}`)
    for (const it of items) {
      console.log(`  ${it.line}:${it.column}  ${it.message}`)
    }
  }
}

main().catch((err) => {
  console.error('Report failed:', err)
  process.exit(1)
})
