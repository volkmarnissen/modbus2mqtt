import * as fs from 'fs'
import * as path from 'path'
import { join } from 'path'
import { parse } from 'yaml'
import { IModbusData, Idata, IfileSpecification } from './ifilespecification.js'
import {
  FileLocation,
  IimageAndDocumentUrl,
  ModbusRegisterType,
  SPECIFICATION_FILES_VERSION,
  SPECIFICATION_VERSION,
  getBaseFilename,
} from '../shared/specification/index.js'
import { LogLevelEnum, Logger } from './log.js'
const log = new Logger('migrator')

const filesUrlPrefix = 'specifications/files'

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.gif':
      return 'image/gif'
    case '.svg':
      return 'image/svg+xml'
    case '.webp':
      return 'image/webp'
    case '.pdf':
      return 'application/pdf'
    default:
      return 'application/octet-stream'
  }
}

export interface IimageAndDocumentFilesType {
  version: string
  files: IimageAndDocumentUrl[]
}
enum ModbusFunctionCodes {
  readHoldingRegisters = 3,
  readCoils = 1,
  readAnalogInputs = 4,
  writeCoils = 15,
  writeAnalogOutput = 6,
  readWriteHoldingRegisters = 21,
  readAnalogs = 22,
  readWriteCoils = 20,
  writeHoldingRegisters = 16,
  IllegalFunctionCode = 0,
}

const FCOffset: number = 100000
export class Migrator {
  constructor() {}

  migrate(filecontent: any, directory?: string): IfileSpecification {
    let count = 0
    const maxCount = 5
    while (filecontent.version != undefined && count < maxCount) {
      count++
      switch (filecontent.version) {
        case '0.1':
          filecontent = this.migrate0_1to0_2(filecontent)
          break
        case '0.2':
          filecontent = this.migrate0_2to0_3(filecontent)
          break
        case '0.3':
          filecontent = this.migrate0_3to0_4(filecontent)
          break
        case '0.4':
          filecontent = this.migrate0_4to0_5(filecontent, directory)
          break
        case SPECIFICATION_VERSION:
          return filecontent
        default:
          log.log(LogLevelEnum.error, 'Migration: Specification Version ' + filecontent.version + ' is unknown')
          throw new Error('Specification Version ' + filecontent.version + ' is unknown')
      }
    }

    return filecontent
  }
  private fc2registerType(functioncode: number): { registerType: ModbusRegisterType; readonly: boolean } | undefined {
    switch (functioncode) {
      case ModbusFunctionCodes.readHoldingRegisters:
        return {
          registerType: ModbusRegisterType.HoldingRegister,
          readonly: true,
        }
      case ModbusFunctionCodes.readCoils:
        return {
          registerType: ModbusRegisterType.Coils,
          readonly: true,
        }
      case ModbusFunctionCodes.readAnalogInputs:
        return {
          registerType: ModbusRegisterType.AnalogInputs,
          readonly: true,
        }
      case ModbusFunctionCodes.writeCoils:
        return {
          registerType: ModbusRegisterType.Coils,
          readonly: false,
        }
      case ModbusFunctionCodes.writeAnalogOutput:
        return {
          registerType: ModbusRegisterType.AnalogInputs,
          readonly: false,
        }
      case ModbusFunctionCodes.readWriteHoldingRegisters:
        return {
          registerType: ModbusRegisterType.HoldingRegister,
          readonly: false,
        }
      case ModbusFunctionCodes.readAnalogs:
        return {
          registerType: ModbusRegisterType.AnalogInputs,
          readonly: true,
        }
      case ModbusFunctionCodes.readWriteCoils:
        return {
          registerType: ModbusRegisterType.Coils,
          readonly: false,
        }
      case ModbusFunctionCodes.writeHoldingRegisters:
        return {
          registerType: ModbusRegisterType.HoldingRegister,
          readonly: false,
        }
      case ModbusFunctionCodes.IllegalFunctionCode:
        log.log(LogLevelEnum.error, 'Function Code' + functioncode + ' is unknown')
    }
    return undefined
  }

  migrate0_1to0_2(filecontent: any): IfileSpecification {
    filecontent.version = '0.2'
    // functioncode to registerType
    if (filecontent.entities)
      filecontent.entities.forEach((entity: any) => {
        delete entity.converter.functionCodes
        entity.converter.name = this.getConvertername0_1(entity.converter.name)
        entity.converter.registerTypes = []
        const rt = this.fc2registerType(entity.functionCode)
        if (rt) {
          entity.registerType = rt.registerType
          entity.readonly = rt.readonly
          delete entity.functionCode
        }
      })
    const td: IModbusData = {
      coils: [],
      analogInputs: [],
      holdingRegisters: [],
    }
    if (filecontent.testdata) {
      filecontent.testdata.forEach((data: any) => {
        const fc = Math.floor(data.address / FCOffset)
        const address = data.address % FCOffset
        const value = data.value
        const rt = this.fc2registerType(fc)
        if (rt)
          switch (rt.registerType) {
            case ModbusRegisterType.AnalogInputs:
              td.analogInputs!.push({ address: address, value: value })
              break
            case ModbusRegisterType.HoldingRegister:
              td.holdingRegisters!.push({ address: address, value: value })
              break
            case ModbusRegisterType.Coils:
              td.coils!.push({ address: address, value: value })
              break
          }
      })
    }
    if (td.analogInputs!.length == 0) delete td.analogInputs
    if (td.holdingRegisters!.length == 0) delete td.holdingRegisters
    if (td.coils!.length == 0) delete td.coils

    filecontent.testdata = td

    return filecontent
  }
  convertTestData0_2to0_3(data: Idata[]) {
    if (data)
      data.forEach((data: any) => {
        if (data?.value == null) {
          delete data.value
          data.error = new Error('No data available')
        }
      })
  }

  migrate0_2to0_3(filecontent: any): IfileSpecification {
    filecontent.version = '0.3'

    if (filecontent.testdata) {
      this.convertTestData0_2to0_3(filecontent.testdata.analogInputs)
      this.convertTestData0_2to0_3(filecontent.testdata.holdingRegisters)
      this.convertTestData0_2to0_3(filecontent.testdata.coils)
    }
    return filecontent
  }

  migrate0_3to0_4(filecontent: any): IfileSpecification {
    filecontent.version = '0.4'
    if (filecontent.entities) filecontent.entities.forEach((e: any) => (e.converter = e.converter.name))
    return filecontent
  }

  migrate0_4to0_5(filecontent: any, directory?: string): IfileSpecification {
    filecontent.version = '0.5'
    // Embed files (base64) from files.yaml + binary files into IfileSpecification
    if (directory && filecontent.filename) {
      const filesYamlPath = join(directory, 'files', filecontent.filename, 'files.yaml')
      if (fs.existsSync(filesYamlPath)) {
        const src = fs.readFileSync(filesYamlPath, { encoding: 'utf8' })
        let f: IimageAndDocumentFilesType = parse(src)
        f = this.migrateFiles(f)
        filecontent.files = f.files
        filecontent.files.forEach((file: IimageAndDocumentUrl) => {
          if (file.fileLocation == FileLocation.Local) {
            const baseFilename = getBaseFilename(file.url)
            if (baseFilename) {
              const binaryPath = join(directory, 'files', filecontent.filename, baseFilename)
              if (fs.existsSync(binaryPath)) {
                file.data = fs.readFileSync(binaryPath).toString('base64')
                file.mimeType = getMimeType(baseFilename)
              }
            }
            // Normalize URL to standard format
            file.url = join(filesUrlPrefix, filecontent.filename, getBaseFilename(file.url))
          }
        })
      } else {
        if (!filecontent.files) filecontent.files = []
      }
    } else {
      if (!filecontent.files) filecontent.files = []
    }
    return filecontent
  }
  getConvertername0_1(converter: string): string {
    switch (converter) {
      case 'sensor':
        return 'number'

      case 'number':
      case 'select':
      case 'text':
      case 'button':
      case 'value':
        return converter

      case 'text_sensor':
      case 'select_sensor':
      case 'binary_sensor':
      case 'value_sensor':
        return converter.replaceAll('_sensor', '')
    }
    log.log(LogLevelEnum.error, 'Unable to convert converter to registerType ' + converter)
    return converter
  }

  migrateFiles(fileContent: any): IimageAndDocumentFilesType {
    if (fileContent.length) {
      fileContent.forEach((fc: IimageAndDocumentUrl) => {
        if (fc.fileLocation == FileLocation.Local && fc.url.startsWith('/')) fc.url = fc.url.substring(1) // Remove trailing  '/'
      })
      return { version: SPECIFICATION_FILES_VERSION, files: fileContent }
    }
    return fileContent
  }
}
