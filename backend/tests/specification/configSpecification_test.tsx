import { it, expect, beforeEach, afterEach } from 'vitest'
/* eslint-disable vitest/no-disabled-tests */
import { ConfigSpecification } from '../../src/specification/index.js'
import * as fs from 'fs'
import { join } from 'path'
import { configDir, singleMutex, dataDir } from './configsbase.js'
import {
  IbaseSpecification,
  SPECIFICATION_VERSION,
  SpecificationFileUsage,
  FileLocation,
  SpecificationStatus,
  getFileNameFromName,
  getSpecificationI18nName,
  newSpecification,
} from '../../src/shared/specification/index.js'
import { SpecificationTestHelper, TempConfigDirHelper } from '../server/testhelper.js'

ConfigSpecification['configDir'] = configDir
ConfigSpecification['dataDir'] = dataDir
ConfigSpecification.setMqttdiscoverylanguage('en')

// Test helper for file backups
let testHelper: SpecificationTestHelper
let tempHelper: TempConfigDirHelper

beforeEach(() => {
  // Use per-test temp dirs to avoid mutating shared specs
  tempHelper = new TempConfigDirHelper('configSpecification_test')
  tempHelper.setup()
  testHelper = new SpecificationTestHelper()
  // Backup essential files inside the temp config dir
  testHelper.backupAll(ConfigSpecification.configDir)
})

afterEach(() => {
  // Restore files within temp dir and cleanup
  testHelper.restoreAll()
  if (tempHelper) tempHelper.cleanup()
})

it('check device type status', () => {
  const localSpecdir = ConfigSpecification.getLocalDir() + '/specifications'
  const publicSpecdir = ConfigSpecification.getPublicDir() + '/specifications'
  fs.mkdirSync(publicSpecdir, { recursive: true })
  const pwtl1 = join(publicSpecdir, 'waterleveltransmitter.yaml')
  fs.copyFileSync(join(localSpecdir, 'waterleveltransmitter.yaml'), pwtl1)
  const pdy = join(publicSpecdir, 'deyeinverter.yaml')
  fs.copyFileSync(join(localSpecdir, 'waterleveltransmitter.yaml'), pdy)

  fs.copyFileSync(join(localSpecdir, 'waterleveltransmitter.yaml'), join(localSpecdir, 'waterleveltransmitter1.yaml'))

  const configSpec = new ConfigSpecification()
  configSpec.readYaml()
  ConfigSpecification.setMqttdiscoverylanguage('en')
  expect(ConfigSpecification.getSpecificationByFilename('waterleveltransmitter')!.status).toBe(SpecificationStatus.cloned)
  expect(ConfigSpecification.getSpecificationByFilename('deyeinverter')!.status).toBe(SpecificationStatus.published)
  expect(ConfigSpecification.getSpecificationByFilename('newDevice')!.status).toBe(SpecificationStatus.added)
  fs.rmSync(pwtl1)
  fs.rmSync(pdy)
})
it('write/Migrate', () => {
  fs.copyFileSync(
    join(ConfigSpecification.getLocalDir() + '/specifications', 'waterleveltransmitter.yaml'),
    join(ConfigSpecification.getLocalDir() + '/specifications', 'waterleveltransmitter1.yaml')
  )

  const configSpec = new ConfigSpecification()
  configSpec.readYaml()
  let wl = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter')!
  configSpec.writeSpecificationFromFileSpec(wl, wl.filename)
  configSpec.readYaml()
  wl = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter')!
  expect(wl.version).toBe(SPECIFICATION_VERSION)
  fs.copyFileSync(
    join(ConfigSpecification.getLocalDir() + '/specifications', 'waterleveltransmitter1.yaml'),
    join(ConfigSpecification.getLocalDir() + '/specifications', 'waterleveltransmitter.yaml')
  )
  fs.unlinkSync(join(ConfigSpecification.getLocalDir() + '/specifications', 'waterleveltransmitter1.yaml'))
})

function cleanDimplexLocal() {
  const yamlPath = join(ConfigSpecification.getLocalDir() + '/specifications', 'dimplexpco5.yaml')
  const jsonPath = join(ConfigSpecification.getLocalDir() + '/specifications', 'dimplexpco5.json')
  if (fs.existsSync(yamlPath)) fs.unlinkSync(yamlPath)
  if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath)
  fs.rmSync(join(ConfigSpecification.getLocalDir() + '/specifications/files/dimplexpco5'), { recursive: true, force: true })
}

it('write cloned file', () => {
  const configSpec = new ConfigSpecification()
  cleanDimplexLocal()
  configSpec.readYaml()
  let wl = ConfigSpecification.getSpecificationByFilename('dimplexpco5')!

  configSpec.writeSpecificationFromFileSpec(wl, wl.filename)
  const specsDir = join(ConfigSpecification.getLocalDir() + '/specifications')
  expect(fs.existsSync(join(specsDir, 'dimplexpco5.json'))).toBeTruthy()
  expect(fs.existsSync(join(specsDir, 'files/dimplexpco5', 'files.yaml'))).toBeTruthy()
  expect(fs.existsSync(join(specsDir, 'files/dimplexpco5', 'IMG_1552.jpg'))).toBeTruthy()
  configSpec.readYaml()
  wl = ConfigSpecification.getSpecificationByFilename('dimplexpco5')!
  expect(wl.version).toBe(SPECIFICATION_VERSION)
  cleanDimplexLocal()
})

it('getFileNameFromName remove non ascii characters', () => {
  const name = '/\\*& asdf+-_.'
  const fn = getFileNameFromName(name)
  expect(fn).toBe('asdf+-_.')
})
it('getSpecificationI18nName ', () => {
  const name = '/\\*& asdf+-_.'
  const configSpec = new ConfigSpecification()
  configSpec.readYaml()
  const fn = getFileNameFromName(name)
  const spec = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter')
  expect(getSpecificationI18nName(spec!, 'fr')).toBe('Water Level Transmitter')
  expect(getSpecificationI18nName(spec!, 'en')).toBe('Water Level Transmitter')
  expect(fn).toBe('asdf+-_.')
})

it('add new specification, add files (base64), set filename', () => {
  const cfgSpec = new ConfigSpecification()
  cfgSpec.readYaml()

  const mspec = newSpecification
  // Add files as base64 directly (no separate upload)
  mspec.files = [
    { url: 'test.pdf', fileLocation: FileLocation.Local, usage: SpecificationFileUsage.documentation, data: Buffer.from('test').toString('base64'), mimeType: 'application/pdf' },
    { url: 'test.jpg', fileLocation: FileLocation.Local, usage: SpecificationFileUsage.img, data: Buffer.from('test').toString('base64'), mimeType: 'image/jpeg' },
  ]
  let g = ConfigSpecification.getSpecificationByFilename('_new')
  expect(g).not.toBeNull()
  expect(g!.files.find((f) => f.url === 'test.jpg')).not.toBeNull()
  expect(g!.files.find((f) => f.url === 'test.pdf')).not.toBeNull()

  mspec.filename = 'addspectest'
  let wasCalled = false

  cfgSpec.writeSpecification(
    mspec,
    (filename) => {
      expect(filename).toBe(mspec.filename)
      wasCalled = true
    },
    null
  )
  expect(wasCalled).toBeTruthy()
  g = ConfigSpecification.getSpecificationByFilename('addspectest')
  expect(g).not.toBeNull()
  expect(g!.files.length).toBe(2)

  wasCalled = false
  cfgSpec.writeSpecification(
    mspec,
    (filename) => {
      expect(filename).toBe(mspec.filename)
      wasCalled = true
    },
    null
  )
  cfgSpec.deleteSpecification('addspectest')
})
it('contribution', () => {
  singleMutex.runExclusive(() => {
    const cfg = new ConfigSpecification()
    const localSpecdir = ConfigSpecification.getLocalDir() + '/specifications'
    const contributedSpecdir = ConfigSpecification.getContributedDir() + '/specifications'
    fs.copyFileSync(join(localSpecdir, 'waterleveltransmitter.yaml'), join(localSpecdir, 'waterleveltransmitter1.yaml'))
    const filesDir = join(localSpecdir, 'files/waterleveltransmitter1')
    const publicSpecdir = ConfigSpecification.getPublicDir() + '/specifications'
    fs.mkdirSync(publicSpecdir, { recursive: true })

    cleanWaterLevelTransmitter1(publicSpecdir)
    cleanWaterLevelTransmitter1(contributedSpecdir)
    if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir)
    fs.copyFileSync(
      join(localSpecdir, 'files/waterleveltransmitter/files.yaml'),
      join(localSpecdir, 'files/waterleveltransmitter1/files.yaml')
    )
    cfg.readYaml()
    let g = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter1')
    expect(g).toBeDefined()
    expect(g?.status).toBe(SpecificationStatus.added)

    expect(fs.existsSync(join(localSpecdir, 'waterleveltransmitter1.yaml'))).toBeTruthy()
    expect(fs.existsSync(join(localSpecdir, 'files/waterleveltransmitter1/files.yaml'))).toBeTruthy()
    cfg.changeContributionStatus('waterleveltransmitter1', SpecificationStatus.contributed, 1)
    expect(fs.existsSync(join(contributedSpecdir, 'waterleveltransmitter1.json'))).toBeTruthy()
    expect(fs.existsSync(join(contributedSpecdir, 'files/waterleveltransmitter1/files.yaml'))).toBeTruthy()
    expect(fs.existsSync(join(localSpecdir, 'waterleveltransmitter1.yaml'))).toBeFalsy()
    expect(fs.existsSync(join(localSpecdir, 'files/waterleveltransmitter1/files.yaml'))).toBeFalsy()

    g = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter1')
    expect(g?.status).toBe(SpecificationStatus.contributed)
    cfg.changeContributionStatus('waterleveltransmitter1', SpecificationStatus.added, undefined)
    expect(fs.existsSync(join(localSpecdir, 'waterleveltransmitter1.json'))).toBeTruthy()
    expect(fs.existsSync(join(localSpecdir, 'files/waterleveltransmitter1/files.yaml'))).toBeTruthy()
    g = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter1')
    expect(g?.status).toBe(SpecificationStatus.added)
    cfg.changeContributionStatus('waterleveltransmitter1', SpecificationStatus.contributed, 1)
    expect(fs.existsSync(join(contributedSpecdir, 'waterleveltransmitter1.json'))).toBeTruthy()
    expect(fs.existsSync(join(contributedSpecdir, 'files/waterleveltransmitter1/files.yaml'))).toBeTruthy()
    g = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter1')
    expect(g?.status).toBe(SpecificationStatus.contributed)
    cfg.changeContributionStatus('waterleveltransmitter1', SpecificationStatus.published, 1)
    g = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter1')

    expect(fs.existsSync(join(contributedSpecdir, 'waterleveltransmitter1.json'))).toBeFalsy()
    expect(fs.existsSync(join(contributedSpecdir, 'files/waterleveltransmitter1/files.yaml'))).toBeFalsy()
    expect(g?.status).toBe(SpecificationStatus.published)
    cleanWaterLevelTransmitter1(publicSpecdir)
    cleanWaterLevelTransmitter1(contributedSpecdir)
    cleanWaterLevelTransmitter1(localSpecdir)
  })
})

function cleanWaterLevelTransmitter1(specdir: string) {
  if (fs.existsSync(join(specdir, 'files/waterleveltransmitter1')))
    fs.rmSync(join(specdir, 'files/waterleveltransmitter1'), { recursive: true })
  if (fs.existsSync(join(specdir, 'waterleveltransmitter1.yaml')))
    fs.unlinkSync(join(specdir, 'waterleveltransmitter1.yaml'))
  if (fs.existsSync(join(specdir, 'waterleveltransmitter1.json')))
    fs.unlinkSync(join(specdir, 'waterleveltransmitter1.json'))
}
it('contribution cloned', () => {
  singleMutex.runExclusive(() => {
    const cfg = new ConfigSpecification()
    const localSpecdir = ConfigSpecification.getLocalDir() + '/specifications'
    const publicSpecdir = ConfigSpecification.getPublicDir() + '/specifications'
    const contributedSpecdir = ConfigSpecification.getContributedDir() + '/specifications'
    fs.mkdirSync(localSpecdir, { recursive: true })
    fs.copyFileSync(join(localSpecdir, 'waterleveltransmitter.yaml'), join(localSpecdir, 'waterleveltransmitter1.yaml'))
    fs.copyFileSync(join(localSpecdir, 'waterleveltransmitter.yaml'), join(publicSpecdir, 'waterleveltransmitter1.yaml'))
    cleanWaterLevelTransmitter1(contributedSpecdir)
    const filesDir = join(localSpecdir, 'files/waterleveltransmitter1')
    const publicfilesDir = join(publicSpecdir, 'files/waterleveltransmitter1')

    if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true })
    if (!fs.existsSync(publicfilesDir)) fs.mkdirSync(publicfilesDir, { recursive: true })
    fs.copyFileSync(
      join(localSpecdir, 'files/waterleveltransmitter/files.yaml'),
      join(localSpecdir, 'files/waterleveltransmitter1/files.yaml')
    )
    fs.copyFileSync(
      join(localSpecdir, 'files/waterleveltransmitter/files.yaml'),
      join(publicSpecdir, 'files/waterleveltransmitter1/files.yaml')
    )
    cfg.readYaml()
    let g = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter1')
    expect(g).toBeDefined()
    expect(g?.status).toBe(SpecificationStatus.cloned)

    expect(fs.existsSync(join(localSpecdir, 'waterleveltransmitter1.yaml'))).toBeTruthy()
    expect(fs.existsSync(join(localSpecdir, 'files/waterleveltransmitter1/files.yaml'))).toBeTruthy()
    expect(fs.existsSync(join(publicSpecdir, 'waterleveltransmitter1.yaml'))).toBeTruthy()
    expect(fs.existsSync(join(publicSpecdir, 'files/waterleveltransmitter1/files.yaml'))).toBeTruthy()
    cfg.changeContributionStatus('waterleveltransmitter1', SpecificationStatus.contributed, 1)
    expect(fs.existsSync(join(contributedSpecdir, 'waterleveltransmitter1.json'))).toBeTruthy()
    expect(fs.existsSync(join(contributedSpecdir, 'files/waterleveltransmitter1/files.yaml'))).toBeTruthy()
    expect(fs.existsSync(join(localSpecdir, 'waterleveltransmitter1.yaml'))).toBeFalsy()
    expect(fs.existsSync(join(localSpecdir, 'files/waterleveltransmitter1/files.yaml'))).toBeFalsy()

    g = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter1')
    expect(g?.status).toBe(SpecificationStatus.contributed)
    cfg.changeContributionStatus('waterleveltransmitter1', SpecificationStatus.cloned, undefined)
    expect(fs.existsSync(join(localSpecdir, 'waterleveltransmitter1.json'))).toBeTruthy()
    expect(fs.existsSync(join(localSpecdir, 'files/waterleveltransmitter1/files.yaml'))).toBeTruthy()
    g = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter1')
    expect(g?.status).toBe(SpecificationStatus.cloned)
    cfg.changeContributionStatus('waterleveltransmitter1', SpecificationStatus.contributed, 1)
    expect(fs.existsSync(join(contributedSpecdir, 'waterleveltransmitter1.json'))).toBeTruthy()
    expect(fs.existsSync(join(contributedSpecdir, 'files/waterleveltransmitter1/files.yaml'))).toBeTruthy()
    g = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter1')
    expect(g?.status).toBe(SpecificationStatus.contributed)
    cfg.changeContributionStatus('waterleveltransmitter1', SpecificationStatus.published, 1)
    g = ConfigSpecification.getSpecificationByFilename('waterleveltransmitter1')

    expect(fs.existsSync(join(contributedSpecdir, 'waterleveltransmitter1.json'))).toBeFalsy()
    expect(fs.existsSync(join(contributedSpecdir, 'files/waterleveltransmitter1/files.yaml'))).toBeFalsy()
    expect(g?.status).toBe(SpecificationStatus.published)
    cleanWaterLevelTransmitter1(publicSpecdir)
    cleanWaterLevelTransmitter1(contributedSpecdir)
    cleanWaterLevelTransmitter1(localSpecdir)
  })
})

it.skip('importSpecificationZip existing Specification', () => {
  return new Promise<void>((resolve) => {
    const zipFile = 'spec.zip'
    const s = fs.createWriteStream(zipFile)
    ConfigSpecification.createZipFromSpecification('waterleveltransmitter', s)
    const errors = ConfigSpecification.importSpecificationZip(zipFile)
    expect(errors.errors).not.toBe('')
    resolve()
  })
})

function removeLocal(specPath: string, specFilesPath: string) {
  fs.rmSync(specFilesPath, { recursive: true, force: true })
  try {
    fs.rmSync(specPath, { recursive: true, force: true })
  } catch (e: any) {
    if (e.code != 'ENOENT') console.log('error ' + e.message)
  }
}
it('importSpecificationZip ', () => {
  return new Promise<void>((resolve) => {
    const filename = 'eastronsdm720-m'
    const zipFile = join(ConfigSpecification.configDir, filename + '.zip')
    const specPath = ConfigSpecification['getSpecificationPath']({ filename: filename } as IbaseSpecification)
    const specFilesPath = ConfigSpecification['getLocalFilesPath'](filename)

    removeLocal(specPath, specFilesPath)

    // Create the specification locally to be able to create the zip file in the next step

    const s = fs.createWriteStream(zipFile)
    s.on('end', () => {
      console.log('Write finished')
    })
    s.on('error', () => {
      console.log('Write finished')
    })
    s.on('finish', () => {
      s.end()
      // Remove specification to be able to import it w/o error
      removeLocal(specPath, specFilesPath)

      ConfigSpecification.importSpecificationZip(zipFile)
      expect(fs.existsSync(specPath)).toBeTruthy()
      expect(fs.existsSync(specFilesPath)).toBeTruthy()
      removeLocal(specPath, specFilesPath)
      resolve()
    })

    // Ensure public spec + files exist in temp data dir for zip creation
    const publicFilesPath = ConfigSpecification['getPublicFilesPath'](filename)
    const publicSpecPath = ConfigSpecification['getPublicSpecificationPath']({ filename } as IbaseSpecification)
    fs.mkdirSync(publicFilesPath, { recursive: true })
    fs.mkdirSync(join(publicSpecPath, '..'), { recursive: true })
    try {
      fs.writeFileSync(join(publicFilesPath, 'files.yaml'), 'files:\n', { encoding: 'utf8' })
    } catch {}
    try {
      fs.writeFileSync(publicSpecPath, `filename: ${filename}\nentities: []\n`, { encoding: 'utf8' })
    } catch {}

    ConfigSpecification.createZipFromSpecification(filename, s)
    // s.on( finish will be called after createZipFromSpecification
  })
})
