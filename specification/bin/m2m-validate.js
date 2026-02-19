#!/usr/bin/env node
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const target = path.join(__dirname, '..', 'dist', 'specification', 'validate.js')
// Load the CLI module (which should parse args and run)
await import(target)
