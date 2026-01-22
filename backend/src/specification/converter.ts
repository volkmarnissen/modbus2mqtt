import { Ientity, ModbusRegisterType, Ispecification, Converters } from '../shared/specification/index.js'

export interface ReadRegisterResult {
  data: Array<number>
  buffer: Buffer
}
// Base class for all converters
export abstract class Converter {
  constructor(protected component: Converters) {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getModbusLength(_dummy: Ientity): number {
    return 1
  }

  abstract modbus2mqtt(spec: Ispecification, entityid: number, value: number[]): number | string
  abstract mqtt2modbus(spec: Ispecification, entityid: number, _value: number | string): number[]
  // the following methods must work w/o meta data because they are needed for the converter ui
  getRequiredParameters(): string[] {
    return []
  }
  getOptionalParameters(): string[] {
    return ['value_sensor', 'discovertemplate']
  }
  publishModbusValues(): boolean {
    return false
  }

  abstract getModbusRegisterTypes(): ModbusRegisterType[]
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getParameterType(_entity: Ientity): string | undefined {
    return undefined
  }
}
