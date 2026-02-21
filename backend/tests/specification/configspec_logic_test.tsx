import { it, expect, beforeEach, afterEach } from 'vitest'
import { ConfigSpecification } from '../../src/specification/index.js'
import { TempConfigDirHelper } from '../server/testhelper.js'
import * as fs from 'fs'
import { join } from 'path'
import { SpecificationStatus, SPECIFICATION_VERSION } from '../../src/shared/specification/index.js'

const configDir = '__tests__/specification/config-dir'
const dataDir = '__tests__/specification/data-dir'
ConfigSpecification['configDir'] = configDir
ConfigSpecification['dataDir'] = dataDir
ConfigSpecification.setMqttdiscoverylanguage('en')

let tempHelper: TempConfigDirHelper

beforeEach(() => {
  tempHelper = new TempConfigDirHelper('configspec_logic')
  tempHelper.setup()
})

afterEach(() => {
  if (tempHelper) tempHelper.cleanup()
})

// Test 9: publicSpecification references set correctly
it('readYaml: publicSpecification references set for cloned specs', () => {
  const localSpecDir = join(ConfigSpecification.getLocalDir(), 'specifications')
  const publicSpecDir = join(ConfigSpecification.getPublicDir(), 'specifications')
  fs.mkdirSync(publicSpecDir, { recursive: true })

  // Copy waterleveltransmitter to public dir (as JSON)
  const srcJson = join(localSpecDir, 'waterleveltransmitter.json')
  const pubJson = join(publicSpecDir, 'waterleveltransmitter.json')
  fs.copyFileSync(srcJson, pubJson)

  const cfgSpec = new ConfigSpecification()
  cfgSpec.readYaml()

  const spec = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter')
  expect(spec).toBeDefined()
  // Status is always derived from file presence: local + public = cloned
  expect(spec!.status).toBe(SpecificationStatus.cloned)

  // Cleanup
  if (fs.existsSync(pubJson)) fs.unlinkSync(pubJson)
})

// Test 10: Files inheritance — local spec with empty files inherits from published
it('readYaml: local spec inherits files from published spec', () => {
  const localSpecDir = join(ConfigSpecification.getLocalDir(), 'specifications')
  const publicSpecDir = join(ConfigSpecification.getPublicDir(), 'specifications')
  fs.mkdirSync(publicSpecDir, { recursive: true })

  // Create a JSON published spec with files
  const pubSpec = {
    version: SPECIFICATION_VERSION,
    filename: 'inherittest',
    entities: [],
    files: [{ url: 'specifications/files/inherittest/doc.pdf', fileLocation: 0, usage: 0, data: 'AAAA', mimeType: 'application/pdf' }],
    i18n: [{ lang: 'en', name: 'Inherit Test', description: '' }],
    testdata: {},
    status: SpecificationStatus.published,
  }
  fs.writeFileSync(join(publicSpecDir, 'inherittest.json'), JSON.stringify(pubSpec, null, 2), 'utf8')

  // Create a local spec with empty files
  const localSpec = {
    version: SPECIFICATION_VERSION,
    filename: 'inherittest',
    entities: [],
    files: [],
    i18n: [{ lang: 'en', name: 'Inherit Test', description: '' }],
    testdata: {},
    status: SpecificationStatus.cloned,
  }
  fs.writeFileSync(join(localSpecDir, 'inherittest.json'), JSON.stringify(localSpec, null, 2), 'utf8')

  const cfgSpec = new ConfigSpecification()
  cfgSpec.readYaml()

  const spec = ConfigSpecification.getSpecificationByFilename('inherittest')
  expect(spec).toBeDefined()
  expect(spec!.files.length).toBe(1)
  expect(spec!.files[0].mimeType).toBe('application/pdf')

  // Cleanup
  fs.unlinkSync(join(publicSpecDir, 'inherittest.json'))
  fs.unlinkSync(join(localSpecDir, 'inherittest.json'))
})

// Test 11: getSpecificationByFilename — lookup
it('getSpecificationByFilename: returns correct spec', () => {
  const cfgSpec = new ConfigSpecification()
  cfgSpec.readYaml()

  const spec = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter')
  expect(spec).toBeDefined()
  expect(spec!.filename).toBe('waterleveltransmitter')
  expect(spec!.entities.length).toBeGreaterThan(0)

  // Non-existent returns undefined
  const missing = ConfigSpecification.getSpecificationByFilename('nonexistent_spec_xyz')
  expect(missing).toBeUndefined()
})

// Test 12: filterAllSpecifications — iterates all specs
it('filterAllSpecifications: calls function for each spec', () => {
  const cfgSpec = new ConfigSpecification()
  cfgSpec.readYaml()

  const filenames: string[] = []
  cfgSpec.filterAllSpecifications((spec) => {
    filenames.push(spec.filename)
  })

  expect(filenames.length).toBeGreaterThan(0)
  expect(filenames).toContain('waterleveltransmitter')
})

// Test 13: Rename logic — writing spec with changed filename
it('write: rename logic handles filename change', () => {
  const cfgSpec = new ConfigSpecification()
  cfgSpec.readYaml()

  const wl = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter')!
  // Write a copy with a new name
  const copy = structuredClone(wl)
  copy.filename = 'wlt_renamed_test'
  copy.status = SpecificationStatus.new
  cfgSpec.writeSpecificationFromFileSpec(copy, null)

  const jsonPath = join(ConfigSpecification.getLocalDir(), 'specifications', 'wlt_renamed_test.json')
  expect(fs.existsSync(jsonPath)).toBe(true)

  const reread = ConfigSpecification.getSpecificationByFilename('wlt_renamed_test')
  expect(reread).toBeDefined()
  expect(reread!.status).toBe(SpecificationStatus.added)

  // Cleanup
  cfgSpec.deleteSpecification('wlt_renamed_test')
})
