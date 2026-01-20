#!/usr/bin/env node
// Renames the compiled server entry to .mjs for ESM usage
const fs = require('fs')
const path = require('path')

const src = path.join(__dirname, '..', 'dist', 'server', 'modbus2mqtt.js')
const dest = path.join(__dirname, '..', 'dist', 'server', 'modbus2mqtt.mjs')

try {
  if (fs.existsSync(src)) {
    if (fs.existsSync(dest)) {
      fs.unlinkSync(dest)
    }
    fs.renameSync(src, dest)
    console.log('Renamed', src, 'to', dest)
  } else {
    console.warn('File not found, skip rename:', src)
  }
} catch (err) {
  console.error('Failed to rename .js to .mjs:', err)
  process.exitCode = 1
}
