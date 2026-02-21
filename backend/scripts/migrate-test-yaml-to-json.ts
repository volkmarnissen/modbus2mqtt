/**
 * Migration script: Convert test specification YAML files to JSON.
 *
 * Usage: cd backend && npx tsx scripts/migrate-test-yaml-to-json.ts
 *
 * This script:
 * 1. Finds all *.yaml spec files in test specification directories
 * 2. Reads and migrates them via Migrator.migrate() to current version
 * 3. Writes them as *.json
 * 4. Deletes the old *.yaml files
 * 5. Deletes files/ directories (data is now embedded as base64 in JSON)
 */

import * as fs from 'fs'
import { join, basename, dirname } from 'path'
import { parse } from 'yaml'
import { Migrator } from '../src/specification/migrator.js'
import { IfileSpecification } from '../src/specification/ifilespecification.js'
import { SPECIFICATION_VERSION, SpecificationStatus } from '../src/shared/specification/index.js'

// Spec directories to migrate (relative to backend/)
const specDirs = [
  'tests/server/config-dir/modbus2mqtt/specifications',
  'tests/server/data-dir/public/specifications',
  'tests/server/backendTCP/config-dir/modbus2mqtt/specifications',
  'tests/server/backendTCP/data-dir/public/specifications',
  'tests/specification/config-dir/modbus2mqtt/specifications',
  'tests/specification/data-dir/public/specifications',
]

// Public spec directories (for determining status during migration)
const publicDirs = new Set([
  'tests/server/data-dir/public/specifications',
  'tests/server/backendTCP/data-dir/public/specifications',
  'tests/specification/data-dir/public/specifications',
])

function getPublicNames(dir: string): Set<string> {
  // For public dirs, all specs are "published"
  // For local dirs, check if a corresponding public dir has the same spec
  const names = new Set<string>()
  // Find corresponding public dir
  const publicDir = dir.replace('/config-dir/modbus2mqtt/', '/data-dir/public/')
  if (fs.existsSync(publicDir)) {
    for (const file of fs.readdirSync(publicDir)) {
      if (file.endsWith('.yaml') || file.endsWith('.json')) {
        names.add(file.replace(/\.(yaml|json)$/, ''))
      }
    }
  }
  return names
}

function migrateDirectory(dir: string): void {
  const fullDir = join(process.cwd(), dir)
  if (!fs.existsSync(fullDir)) {
    console.log(`  SKIP (not found): ${dir}`)
    return
  }

  const files = fs.readdirSync(fullDir)
  const yamlFiles = files.filter(f => f.endsWith('.yaml'))

  if (yamlFiles.length === 0) {
    console.log(`  SKIP (no yaml): ${dir}`)
    return
  }

  const isPublicDir = publicDirs.has(dir)
  const publicNames = getPublicNames(dir)
  const migrator = new Migrator()

  for (const yamlFile of yamlFiles) {
    const yamlPath = join(fullDir, yamlFile)
    const specName = yamlFile.replace('.yaml', '')
    const jsonPath = join(fullDir, specName + '.json')

    try {
      // Read and parse YAML
      const src = fs.readFileSync(yamlPath, { encoding: 'utf8' })
      let spec: any = parse(src)
      spec.filename = specName

      // Migrate to current version
      if (spec.version !== SPECIFICATION_VERSION) {
        spec = migrator.migrate(spec, fullDir, publicNames)
      }

      // Set status if not present
      if (spec.status === undefined) {
        if (isPublicDir) {
          spec.status = SpecificationStatus.published
        } else {
          spec.status = publicNames.has(specName) ? SpecificationStatus.cloned : SpecificationStatus.added
        }
      }

      // Ensure files array exists
      if (!spec.files) spec.files = []

      // Write JSON
      fs.writeFileSync(jsonPath, JSON.stringify(spec, null, 2), { encoding: 'utf8' })

      // Delete old YAML
      fs.unlinkSync(yamlPath)

      console.log(`  OK: ${specName}.yaml -> ${specName}.json (v${spec.version})`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`  ERROR: ${yamlFile}: ${msg}`)
    }
  }

  // Delete files/ subdirectories (data is now embedded as base64 in JSON)
  const filesDir = join(fullDir, 'files')
  if (fs.existsSync(filesDir)) {
    // Check each subdirectory - only delete those for migrated specs
    const fileDirs = fs.readdirSync(filesDir, { withFileTypes: true })
    for (const entry of fileDirs) {
      if (entry.isDirectory()) {
        const specFilesDir = join(filesDir, entry.name)
        // Check if files.yaml exists (indicates old format)
        const filesYaml = join(specFilesDir, 'files.yaml')
        if (fs.existsSync(filesYaml)) {
          fs.rmSync(specFilesDir, { recursive: true, force: true })
          console.log(`  DELETED files dir: files/${entry.name}/`)
        }
      }
    }
    // Remove files/ dir if empty
    const remaining = fs.readdirSync(filesDir)
    if (remaining.length === 0) {
      fs.rmdirSync(filesDir)
      console.log(`  DELETED empty files/ dir`)
    }
  }
}

// Also handle yaml-dir test data
function migrateYamlDir(): void {
  const yamlDirSpecs = join(process.cwd(), 'tests/yaml-dir/local/specifications')
  if (fs.existsSync(yamlDirSpecs)) {
    console.log('\n--- tests/yaml-dir/local/specifications ---')
    const files = fs.readdirSync(yamlDirSpecs)
    const yamlFiles = files.filter(f => f.endsWith('.yaml'))
    const migrator = new Migrator()

    for (const yamlFile of yamlFiles) {
      const yamlPath = join(yamlDirSpecs, yamlFile)
      const specName = yamlFile.replace('.yaml', '')
      const jsonPath = join(yamlDirSpecs, specName + '.json')

      try {
        const src = fs.readFileSync(yamlPath, { encoding: 'utf8' })
        let spec: any = parse(src)
        spec.filename = specName
        if (spec.version !== SPECIFICATION_VERSION) {
          spec = migrator.migrate(spec, yamlDirSpecs)
        }
        if (!spec.files) spec.files = []
        if (spec.status === undefined) spec.status = SpecificationStatus.added

        fs.writeFileSync(jsonPath, JSON.stringify(spec, null, 2), { encoding: 'utf8' })
        fs.unlinkSync(yamlPath)
        console.log(`  OK: ${specName}.yaml -> ${specName}.json`)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(`  ERROR: ${yamlFile}: ${msg}`)
      }
    }
  }
}

console.log('Migrating test specification YAML -> JSON...\n')

for (const dir of specDirs) {
  console.log(`--- ${dir} ---`)
  migrateDirectory(dir)
}

migrateYamlDir()

console.log('\nDone.')
