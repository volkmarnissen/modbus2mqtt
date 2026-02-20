import { parse } from 'yaml'
import * as fs from 'fs'
import * as path from 'path'
import { join } from 'path'
import { LogLevelEnum, Logger } from './log.js'
import {
  EnumNumberFormat,
  FileLocation,
  IbaseSpecification,
  IimportMessages,
  ImodbusSpecification,
  Inumber,
  ModbusRegisterType,
  SPECIFICATION_VERSION,
  SpecificationStatus,
  getSpecificationI18nName,
} from '../shared/specification/index.js'
import { getBaseFilename } from '../shared/specification/index.js'
import { IfileSpecification } from './ifilespecification.js'
import { M2mSpecification } from './m2mspecification.js'
import { IimageAndDocumentFilesType, Migrator } from './migrator.js'
import stream from 'stream'

import { M2mGitHub } from './m2mgithub.js'
import AdmZip from 'adm-zip'

const log = new Logger('specification')
export const filesUrlPrefix = 'specifications/files'

export class ConfigSpecification {
  static setMqttdiscoverylanguage(lang: string, ghToken?: string) {
    ConfigSpecification.mqttdiscoverylanguage = lang
    ConfigSpecification.githubPersonalToken = ghToken
  }
  static mqttdiscoverylanguage: string | undefined
  static githubPersonalToken: string | undefined
  static getPublicDir(): string {
    return join(ConfigSpecification.dataDir, 'public')
  }
  static getLocalDir(): string {
    return join(ConfigSpecification.configDir, 'modbus2mqtt')
  }
  constructor() {}
  private static getPublicSpecificationPath(spec: IbaseSpecification): string {
    return ConfigSpecification.getPublicDir() + '/specifications/' + spec.filename + '.yaml'
  }
  private static getSpecificationPath(spec: IbaseSpecification): string {
    return ConfigSpecification.getLocalDir() + '/specifications/' + spec.filename + '.yaml'
  }
  private static getLocalJsonPath(spec: IbaseSpecification): string {
    return ConfigSpecification.getLocalDir() + '/specifications/' + spec.filename + '.json'
  }
  private static getLocalFilesPath(specfilename: string): string {
    return join(ConfigSpecification.getLocalDir(), getSpecificationImageOrDocumentUrl('', specfilename, ''))
  }
  private static getPublicFilesPath(specfilename: string): string {
    return join(ConfigSpecification.getPublicDir(), getSpecificationImageOrDocumentUrl('', specfilename, ''))
  }
  private static specifications: IfileSpecification[] = []

  static resetForE2E(): void {
    ConfigSpecification.specifications = []
  }

  static dataDir: string = ''
  static configDir: string = ''

  private readFilesYaml(directory: string, spec: IfileSpecification) {
    const fp = join(directory, 'files', spec.filename, 'files.yaml')

    if (fs.existsSync(fp)) {
      const src = fs.readFileSync(fp, { encoding: 'utf8' })
      let f: IimageAndDocumentFilesType = parse(src)
      f = new Migrator().migrateFiles(f)

      spec.files = f.files
    } else {
      spec.files = []
    }
    spec.files.forEach((file) => {
      if (file.fileLocation == FileLocation.Local) {
        const url = getSpecificationImageOrDocumentUrl(undefined, spec.filename, file.url)
        file.url = url
      }
    })
  }

  private postProcessSpec(o: IfileSpecification) {
    if (o.entities)
      o.entities.forEach((entity) => {
        if (entity.converter != undefined) {
          const inumber = entity.converterParameters as Inumber
          if (inumber.multiplier != undefined && inumber.numberFormat == undefined) {
            inumber.numberFormat = EnumNumberFormat.default
          }
        }
        if (!o.nextEntityId || entity.id > o.nextEntityId + 1) o.nextEntityId = entity.id + 1
      })
    if (o.pullNumber) o.pullUrl = M2mGitHub.getPullRequestUrl(o.pullNumber)
    if (!o.files) o.files = []
  }

  private writeSpecAsJson(filepath: string, spec: IfileSpecification) {
    const dir = path.dirname(filepath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const ns = structuredClone(spec)
    this.cleanSpecForWriting(ns)
    ns.version = SPECIFICATION_VERSION
    fs.writeFileSync(filepath, JSON.stringify(ns, null, 2), { encoding: 'utf8' })
  }

  // READ-ONLY: reads both JSON and YAML specs from directory. Never writes.
  // publicNames: if provided, used to set status for YAML specs without status field
  //   (filename in publicNames → cloned, otherwise → added)
  private readspecifications(directory: string, publicNames?: Set<string>): IfileSpecification[] {
    const rc: IfileSpecification[] = []
    if (!fs.existsSync(directory)) {
      return rc
    }
    const allFiles: string[] = fs.readdirSync(directory)
    const jsonNames = new Set(allFiles.filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')))

    allFiles.forEach((file: string) => {
      try {
        if (file.endsWith('.json')) {
          const src = fs.readFileSync(join(directory, file), { encoding: 'utf8' })
          const o: IfileSpecification = JSON.parse(src)
          o.filename = file.replace('.json', '')
          this.postProcessSpec(o)
          rc.push(o)
        } else if (file.endsWith('.yaml')) {
          const basename = file.replace('.yaml', '')
          if (jsonNames.has(basename)) return // JSON takes precedence

          const src: string = fs.readFileSync(join(directory, file), { encoding: 'utf8' })
          let o: IfileSpecification = parse(src)
          o.filename = basename // set before migrate so migrator can find files
          if (o.version != SPECIFICATION_VERSION) {
            o = new Migrator().migrate(o, directory, publicNames)
          } else {
            // Already at current version but from YAML: still need to load files
            this.readFilesYaml(directory, o)
            if (o.status == undefined && publicNames) {
              o.status = publicNames.has(basename) ? SpecificationStatus.cloned : SpecificationStatus.added
            }
          }
          this.postProcessSpec(o)
          rc.push(o)
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        log.log(LogLevelEnum.error, 'Unable to load spec ' + file + ' continuing ' + msg)
      }
    })
    return rc
  }

  // Reads all specifications from public + local directories.
  // Status comes from JSON attribute (local) or is 'published' (public).
  // For legacy YAML specs without status, it is derived from publicNames during read.
  readYaml(): void {
    try {
      const publishedSpecifications: IfileSpecification[] = this.readspecifications(
        ConfigSpecification.getPublicDir() + '/specifications'
      )
      publishedSpecifications.forEach((spec) => {
        spec.status = SpecificationStatus.published
      })

      const publicNames = new Set(publishedSpecifications.map((s) => s.filename))
      ConfigSpecification.specifications = this.readspecifications(
        ConfigSpecification.getLocalDir() + '/specifications',
        publicNames
      )

      // Set publicSpecification references and copy files if needed
      ConfigSpecification.specifications.forEach((specification: IfileSpecification) => {
        const published = publishedSpecifications.find((obj) => obj.filename === specification.filename)
        if (published) {
          specification.publicSpecification = published
          if (specification.files.length == 0 && published.files.length > 0)
            specification.files = structuredClone(published.files)
        }
        if (specification.status === SpecificationStatus.contributed && specification.pullNumber == undefined)
          log.log(LogLevelEnum.error, 'Contributed Specification w/o pull request number: ' + specification.filename)
      })

      // Add published specs that have no local counterpart
      publishedSpecifications.forEach((specification: IfileSpecification) => {
        if (!ConfigSpecification.specifications.find((obj) => obj.filename === specification.filename)) {
          ConfigSpecification.specifications.push(specification)
        }
      })
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      log.log(LogLevelEnum.error, 'readyaml failed: ' + msg)
      throw error
    }
  }
  filterAllSpecifications(specFunction: (spec: IfileSpecification) => void) {
    for (const spec of ConfigSpecification.specifications) {
      specFunction(spec)
    }
  }

  static emptyTestData = { holdingRegisters: [], coils: [], analogInputs: [], discreteInputs: [] }
  // removes non configuration data
  // Adds  testData array from Modbus values. They can be used to test specification
  static toFileSpecification(modbusSpec: ImodbusSpecification): IfileSpecification {
    const fileSpec: IfileSpecification = structuredClone({
      ...modbusSpec,
      version: SPECIFICATION_VERSION,
      testdata: structuredClone(this.emptyTestData),
    })
    delete fileSpec['identification']
    // delete (fileSpec as any)['status'];

    modbusSpec.entities.forEach((entity) => {
      if (entity.modbusValue)
        for (let idx = 0; idx < entity.modbusValue.length; idx++) {
          switch (entity.registerType) {
            case ModbusRegisterType.AnalogInputs:
              fileSpec.testdata.analogInputs?.push({
                address: entity.modbusAddress + idx,
                value: entity.modbusValue[idx],
              })
              break
            case ModbusRegisterType.HoldingRegister:
              fileSpec.testdata.holdingRegisters?.push({
                address: entity.modbusAddress + idx,
                value: entity.modbusValue[idx],
              })
              break
            case ModbusRegisterType.Coils:
              fileSpec.testdata.coils?.push({
                address: entity.modbusAddress + idx,
                value: entity.modbusValue[idx],
              })
              break
            case ModbusRegisterType.DiscreteInputs:
              fileSpec.testdata.discreteInputs?.push({
                address: entity.modbusAddress + idx,
                value: entity.modbusValue[idx],
              })
              break
          }
        }
    })
    if (fileSpec.testdata.analogInputs?.length == 0) delete fileSpec.testdata.analogInputs
    if (fileSpec.testdata.holdingRegisters?.length == 0) delete fileSpec.testdata.holdingRegisters
    if (fileSpec.testdata.coils?.length == 0) delete fileSpec.testdata.coils
    if (fileSpec.testdata.discreteInputs?.length == 0) delete fileSpec.testdata.discreteInputs
    fileSpec.entities.forEach((entity) => {
      if ('modbusValue' in (entity as object)) delete (entity as { modbusValue?: unknown }).modbusValue
      if ('mqttValue' in (entity as object)) delete (entity as { mqttValue?: unknown }).mqttValue
      if ('identified' in (entity as object)) delete (entity as { identified?: unknown }).identified
    })
    return fileSpec
  }
  private renameFilesPath(spec: IfileSpecification, oldfilename: string, newDirectory: string) {
    const oldDirectory = ConfigSpecification.getLocalDir()
    const oldPath = getSpecificationImageOrDocumentUrl(oldDirectory, oldfilename, '')
    const newPath = getSpecificationImageOrDocumentUrl(join(newDirectory), spec.filename, '')
    const newParentDir = path.dirname(newPath)
    if (!fs.existsSync(newParentDir)) fs.mkdirSync(newParentDir, { recursive: true })
    if (fs.existsSync(newPath)) fs.rmSync(newPath, { recursive: true })
    if (fs.existsSync(oldPath)) fs.renameSync(oldPath, newPath)
  }

  private cleanSpecForWriting(spec: IfileSpecification): void {
    spec.entities.forEach((e) => {
      if (!e.icon || e.icon.length == 0) delete e.icon
      if ('identified' in (e as object)) delete (e as { identified?: unknown }).identified
      if ('mqttValue' in (e as object)) delete (e as { mqttValue?: unknown }).mqttValue
      if ('modbusValue' in (e as object)) delete (e as { modbusValue?: unknown }).modbusValue
      if ('commandTopicModbus' in (e as object)) delete (e as { commandTopicModbus?: unknown }).commandTopicModbus
      if ('commandTopic' in (e as object)) delete (e as { commandTopic?: unknown }).commandTopic
      const ce = e as unknown as { converter?: unknown }
      const conv = ce.converter as Record<string, unknown> | null
      if (conv && typeof conv === 'object' && 'registerTypes' in conv) delete (conv as Record<string, unknown>)['registerTypes']
    })
    if (!spec.manufacturer || spec.manufacturer.length == 0) delete spec.manufacturer
    if (!spec.model || spec.model.length == 0) delete spec.model
    if (spec.status != SpecificationStatus.contributed) delete spec.pullNumber
    if ('stateTopic' in (spec as object)) delete (spec as { stateTopic?: unknown }).stateTopic
    if ('statePayload' in (spec as object)) delete (spec as { statePayload?: unknown }).statePayload
    if ('triggerPollTopic' in (spec as object)) delete (spec as { triggerPollTopic?: unknown }).triggerPollTopic
    if ('commandTopicModbus' in (spec as object)) delete (spec as { commandTopicModbus?: unknown }).commandTopicModbus

    delete spec.publicSpecification
    if ('identified' in (spec as object)) delete (spec as { identified?: unknown }).identified
    // Never persist transient 'new' status
    if (spec.status === SpecificationStatus.new) {
      spec.status = SpecificationStatus.added
    }
  }
  changeContributionStatus(filename: string, newStatus: SpecificationStatus, pullNumber?: number) {
    // Updates status in JSON only — no file moves between directories
    const spec = ConfigSpecification.specifications.find((f) => f.filename == filename)
    if (!spec) throw new Error('Specification ' + filename + ' not found')
    if (newStatus && newStatus == spec.status) return

    // Determine actual status for added/cloned based on public spec existence
    if (newStatus === SpecificationStatus.added || newStatus === SpecificationStatus.cloned) {
      const publicPath = ConfigSpecification.getPublicSpecificationPath(spec)
      newStatus = fs.existsSync(publicPath) ? SpecificationStatus.cloned : SpecificationStatus.added
      delete spec.pullNumber
    }

    spec.status = newStatus

    if (newStatus === SpecificationStatus.contributed) {
      spec.pullNumber = pullNumber
    }

    if (newStatus === SpecificationStatus.published) {
      // Delete local files — public directory already has the spec from GitHub fetch
      const localJsonPath = ConfigSpecification.getLocalJsonPath(spec)
      const localYamlPath = ConfigSpecification.getSpecificationPath(spec)
      if (fs.existsSync(localJsonPath)) fs.unlinkSync(localJsonPath)
      if (fs.existsSync(localYamlPath)) fs.unlinkSync(localYamlPath)
      const filesPath = ConfigSpecification.getLocalFilesPath(spec.filename)
      if (fs.existsSync(filesPath)) fs.rmSync(filesPath, { recursive: true })
    } else {
      // Rewrite JSON to local dir with updated status
      const jsonPath = ConfigSpecification.getLocalJsonPath(spec)
      this.writeSpecAsJson(jsonPath, spec)
    }
  }

  writeSpecificationFromFileSpec(spec: IfileSpecification, originalFilename: string | null, pullNumber?: number) {
    if (spec.filename == '_new') {
      throw new Error('No or invalid filename for specification')
    }
    const publicFilepath = ConfigSpecification.getPublicSpecificationPath(spec)
    const jsonFilePath = ConfigSpecification.getLocalJsonPath(spec)
    if (spec) {
      if (spec.status == SpecificationStatus.new) {
        this.renameFilesPath(spec, '_new', ConfigSpecification.getLocalDir())
      } else if (originalFilename) {
        if (originalFilename != spec.filename) {
          if (
            spec.status == SpecificationStatus.cloned ||
            spec.status == SpecificationStatus.published ||
            spec.status == SpecificationStatus.contributed
          )
            throw new Error('Cannot rename a published file')
          // delete old spec file (YAML or JSON) and rename files directory
          const s = spec.filename
          spec.filename = originalFilename
          const originalYamlPath = ConfigSpecification.getSpecificationPath(spec)
          const originalJsonPath = ConfigSpecification.getLocalJsonPath(spec)
          spec.filename = s
          if (fs.existsSync(originalYamlPath)) fs.unlinkSync(originalYamlPath)
          if (fs.existsSync(originalJsonPath)) fs.unlinkSync(originalJsonPath)
          this.renameFilesPath(spec, originalFilename, ConfigSpecification.getLocalDir())
        }
      } else throw new Error(spec.status + ' !=' + SpecificationStatus.new + ' and no originalfilename')
      if (spec.files && spec.files.length && [SpecificationStatus.published].includes(spec.status)) {
        // cloning with attached files
        const filespath = ConfigSpecification.getPublicFilesPath(spec.filename)
        const localFilesPath = ConfigSpecification.getLocalFilesPath(spec.filename)
        if (!fs.existsSync(localFilesPath) && fs.existsSync(filespath)) {
          fs.cpSync(filespath, localFilesPath, { recursive: true })
        }
      }
      // Determine status — contributed status is preserved from changeContributionStatus()
      if (pullNumber != undefined) {
        spec.status = SpecificationStatus.contributed
      } else {
        const existingSpec = ConfigSpecification.specifications.find((s) => s.filename === spec.filename)
        if (existingSpec?.status === SpecificationStatus.contributed) {
          spec.status = SpecificationStatus.contributed
          spec.pullNumber = existingSpec.pullNumber
        } else if (!fs.existsSync(publicFilepath)) spec.status = SpecificationStatus.added
        else spec.status = SpecificationStatus.cloned
      }
    } else throw new Error('spec is undefined')

    // Write as JSON (new format - IfileSpecification already contains everything incl. base64)
    this.writeSpecAsJson(jsonFilePath, spec)

    // Clean up old YAML file at same location if it exists
    const yamlCounterpart = jsonFilePath.replace(/\.json$/, '.yaml')
    if (fs.existsSync(yamlCounterpart)) {
      try {
        fs.unlinkSync(yamlCounterpart)
      } catch { /* ignore */ }
    }

    const idx = ConfigSpecification.specifications.findIndex((cspec) => {
      return cspec.filename === spec.filename
    })
    if (idx >= 0) ConfigSpecification.specifications[idx] = spec
    else ConfigSpecification.specifications.push(spec)
    return spec
  }
  writeSpecification(
    spec: ImodbusSpecification,
    onAfterSave: (filename: string) => void | undefined,
    originalFilename: string | null
  ): IfileSpecification {
    const fileSpec: IfileSpecification = ConfigSpecification.toFileSpecification(spec)
    this.writeSpecificationFromFileSpec(fileSpec, originalFilename)
    if (onAfterSave) onAfterSave(fileSpec.filename)
    return fileSpec
  }
  deleteNewSpecificationFiles() {
    const dir = getSpecificationImageOrDocumentUrl(ConfigSpecification.getLocalDir(), '_new', '')
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true })
  }
  deleteSpecification(specfileName: string) {
    for (let idx = 0; idx < ConfigSpecification.specifications.length; idx++) {
      const sp = ConfigSpecification.specifications[idx]
      if (sp.filename === specfileName)
        if (sp.status in [SpecificationStatus.cloned, SpecificationStatus.added, SpecificationStatus.new])
          try {
            // Delete spec files (both JSON and YAML)
            const yamlPath = ConfigSpecification.getSpecificationPath(sp)
            if (fs.existsSync(yamlPath)) fs.unlinkSync(yamlPath)
            const jsonPath = ConfigSpecification.getLocalJsonPath(sp)
            if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath)
            // Delete files directory
            const filesPath = ConfigSpecification.getLocalFilesPath(sp.filename)
            if (fs.existsSync(filesPath)) fs.rmSync(filesPath, { recursive: true })
            log.log(LogLevelEnum.info, 'Specification removed: ' + sp.filename)
            return
          } catch {
            log.log(LogLevelEnum.error, 'Unable to remove Specification ' + sp.filename)
          } finally {
            this.readYaml()
          }
        else {
          log.log(LogLevelEnum.error, 'Unable to remove Specification ' + sp.filename + ': invalid status')
        }
    }
  }

  static getSpecificationByName(name: string): IfileSpecification | undefined {
    return structuredClone(
      ConfigSpecification.specifications.find((spec) => {
        return getSpecificationI18nName(spec, 'en') === name
      })
    )
  }
  static clearModbusData(spec: IfileSpecification) {
    spec.entities.forEach((ent) => {
      if ('modbusError' in (ent as object)) delete (ent as { modbusError?: unknown }).modbusError
      if ('modbusValue' in (ent as object)) delete (ent as { modbusValue?: unknown }).modbusValue
      if ('mqttValue' in (ent as object)) delete (ent as { mqttValue?: unknown }).mqttValue
      if ('identified' in (ent as object)) delete (ent as { identified?: unknown }).identified
    })
    if ('identified' in (spec as object)) delete (spec as { identified?: unknown }).identified
  }

  static getSpecificationByFilename(filename: string | undefined): IfileSpecification | undefined {
    if (filename == undefined) return undefined

    if (filename == '_new') {
      const rc: IfileSpecification = {
        version: SPECIFICATION_VERSION,
        entities: [],
        files: [],
        i18n: [],
        testdata: structuredClone(this.emptyTestData),
        filename: '_new',
        status: SpecificationStatus.new,
      }
      const dir = getSpecificationImageOrDocumentUrl(ConfigSpecification.getLocalDir(), '_new', '')
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir)
        files.forEach((file) => {
          const url = getSpecificationImageOrDocumentUrl(ConfigSpecification.getLocalDir(), '_new', file)
          rc.files.push({
            url: url,
            fileLocation: FileLocation.Local,
            usage: M2mSpecification.getFileUsage(file),
          })
        })
      }
      ConfigSpecification.clearModbusData(rc)
      return rc
    }

    const rc = structuredClone(
      ConfigSpecification.specifications.find((spec) => {
        return spec.filename === filename
      })
    )
    if (rc) ConfigSpecification.clearModbusData(rc)
    return rc
  }
  static getFileNameFromSlaveId(slaveid: number): string {
    return 's' + slaveid
  }

  static createZipFromSpecification(specfilename: string, r: stream.Writable): void {
    const spec = { filename: specfilename } as unknown as IbaseSpecification
    // Try JSON first, then YAML, then public
    let specFilePath = ConfigSpecification.getLocalJsonPath(spec)
    if (!fs.existsSync(specFilePath)) specFilePath = ConfigSpecification.getSpecificationPath(spec)
    if (!fs.existsSync(specFilePath)) specFilePath = ConfigSpecification.getPublicSpecificationPath(spec)

    let fn = ConfigSpecification.getLocalFilesPath(specfilename)
    if (!fs.existsSync(fn)) fn = ConfigSpecification.getPublicFilesPath(specfilename)

    if (!fs.existsSync(specFilePath)) throw new Error('no specification found at ' + specFilePath)

    const z = new AdmZip()
    z.addLocalFile(specFilePath)
    if (fs.existsSync(fn)) z.addLocalFolder(fn, 'files/' + specfilename)

    r.write(z.toBuffer(), () => {
      r.end()
    })
  }

  private static validateSpecificationZip(localSpecDir: string, zip: AdmZip.IZipEntry[]): IimportMessages {
    const errors: IimportMessages = { warnings: '', errors: '' }
    let filesExists = false
    let specExists = false
    for (const entry of zip) {
      if (entry.entryName.endsWith('.json') && !entry.entryName.includes('/')) {
        specExists = true
        filesExists = true // JSON format has embedded files
      } else if (entry.entryName.indexOf('.yaml') > 0) {
        if (entry.entryName.indexOf('/files.yaml') > 0) filesExists = true
        else specExists = true
      }

      if (fs.existsSync(join(localSpecDir, entry.entryName)))
        errors.warnings = errors.warnings + 'File cannot be overwritten: ' + entry.entryName + '\n'
    }

    if (!filesExists) errors.errors = errors.errors + 'No files found\n'
    if (!specExists) errors.errors = errors.errors + 'No specification file found\n'
    return errors
  }

  static importSpecificationZip(zipfilename: string): IimportMessages {
    const localSpecDir = join(ConfigSpecification.getLocalDir(), 'specifications')
    try {
      const z = new AdmZip(zipfilename)
      const errors = this.validateSpecificationZip(localSpecDir, z.getEntries())
      if (errors.errors.length == 0) {
        z.extractAllTo(localSpecDir)
        new ConfigSpecification().readYaml()
        return errors
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return { errors: msg, warnings: '' }
    }
    // Just to make compiler happy
    return { errors: '', warnings: '' }
  }
}

export function getSpecificationImageOrDocumentUrl(rootUrl: string | undefined, specName: string, url: string): string {
  const fn = getBaseFilename(url)
  let rc: string = ''
  if (rootUrl && rootUrl.length > 0) {
    let append = '/'
    if (rootUrl.endsWith('/')) append = ''
    rc = rootUrl + append + join(filesUrlPrefix, specName, fn)
  } else rc = join(filesUrlPrefix, specName, fn)

  return rc
}
