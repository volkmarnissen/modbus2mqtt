import { Bus } from '../../src/server/bus.js'
import { Config } from '../../src/server/config.js'
import {
  Itext,
  IdentifiedStates,
  ImodbusEntity,
  Inumber,
  Converters,
  Ientity,
  Ispecification,
  ModbusRegisterType,
  FileLocation,
  SpecificationFileUsage,
} from '../../src/shared/specification/index.js'
import { Modbus, ModbusForTest } from '../../src/server/modbus.js'
import { getReadRegisterResult } from '../../src/server/submitRequestMock.js'
import { initBussesForTest, setConfigsDirsForTest } from './configsbase.js'
import { Islave, ModbusTasks } from '../../src/shared/server.js'
import { ConfigSpecification, IfileSpecification, emptyModbusValues } from '../../src/specification/index.js'
import { expect, it, describe, beforeEach, vi, beforeAll } from 'vitest'
import Debug from 'debug'
import { ConfigBus } from '../../src/server/configbus.js'
setConfigsDirsForTest()
const debug = Debug('modbus_test')

beforeAll(() => {
  // TODO Fix test ModbusCache.prototype.submitGetHoldingRegisterRequest = submitGetHoldingRegisterRequest
  initBussesForTest()
})
beforeEach(() => {
  spec = {
    entities: [
      {
        id: 1,
        mqttname: 'mqtt',
        converter: 'sensor' as Converters,
        modbusAddress: 4,
        registerType: ModbusRegisterType.HoldingRegister,
        readonly: true,
        icon: '',
        converterParameters: {
          multiplier: 0.1,
          offset: 0,
          uom: 'cm',
          identification: { min: 0, max: 200 },
        },
      },
      {
        id: 2,
        mqttname: 'mqtt2',
        converter: 'select_sensor' as Converters,
        modbusAddress: 2,
        registerType: ModbusRegisterType.HoldingRegister,
        readonly: true,
        icon: '',
        converterParameters: { optionModbusValues: [1, 2, 3] },
      },
      {
        id: 3,
        mqttname: 'mqtt3',
        converter: 'select' as Converters,
        modbusAddress: 3,
        registerType: ModbusRegisterType.HoldingRegister,
        readonly: true,
        icon: '',
        converterParameters: { optionModbusValues: [0, 1, 2, 3] },
      },
    ],
    status: 2,
    manufacturer: 'unknown',
    model: 'QDY30A',
    filename: 'waterleveltransmitter',
    i18n: [
      {
        lang: 'en',
        texts: [
          { textId: 'e1o.1', text: 'ON' },
          { textId: 'e1o.0', text: 'OFF' },
          { textId: 'e1o.2', text: 'test' },
        ],
      },
    ],
    files: [],
  }
})

let spec: Ispecification
const mr = new Modbus()
let dev: Islave | undefined = undefined
const ent: ImodbusEntity = {
  id: 1,
  mqttname: 'mqtt',
  modbusAddress: 3,
  readonly: true,
  registerType: ModbusRegisterType.HoldingRegister,
  modbusValue: [1],
  mqttValue: '',
  identified: IdentifiedStates.unknown,
  converterParameters: { multiplier: 0.01 },
  converter: 'number',
}
const ents: Ientity[] = [ent]
const entText: ImodbusEntity = {
  id: 2,
  mqttname: 'mqtt',
  modbusAddress: 5,
  registerType: ModbusRegisterType.HoldingRegister,
  readonly: true,
  modbusValue: [(65 << 8) | 66, (67 << 8) | 68],
  mqttValue: '',
  identified: IdentifiedStates.unknown,
  converterParameters: { stringlength: 10 },
  converter: 'text',
}
let readConfig = new Config()
let prepared: boolean = false
function prepareIdentification() {
  if (!prepared) {
    prepared = true
    readConfig = new Config()
    readConfig.readYaml()
    ConfigBus.readBusses()
    new ConfigSpecification().readYaml()
    dev = ConfigBus.getSlave(0, 1)!
  }
}

describe('Modbus read', () => {
  it('Modbus read', async () => {
    const readConfig: Config = new Config()
    readConfig.readYaml()
    ConfigBus.readBusses()
    new ConfigSpecification().readYaml()
    const dev = ConfigBus.getSlave(0, 1)!
    expect(dev).toBeDefined
    await new Promise<void>((resolve, reject) => {
      Modbus.getModbusSpecification(
        ModbusTasks.specification,
        Bus.getBus(0)!.getModbusAPI(),
        Bus.getBus(0)!.getSlaveBySlaveId(1)!,
        dev!.specificationid!,
        (_e) => {
          expect(false).toBeTruthy()
          reject(_e)
        }
      ).subscribe((spec1) => {
        const spec = ConfigSpecification.getSpecificationByFilename(dev!.specificationid!)!
        expect(spec).toBeDefined()
        expect((spec1?.entities[0] as ImodbusEntity).mqttValue).toBe((spec1?.entities[0] as ImodbusEntity).mqttValue)
        expect(((spec1?.entities[0] as ImodbusEntity).mqttValue as number) - 21).toBeLessThan(0.001)
        resolve()
      })
    })
  })

  it('Modbus read Entity identifiation unknown', async () => {
    prepareIdentification()
    expect(dev).toBeDefined
    spec.entities = ents
    try {
      const arg0 = await mr.readEntityFromModbus(Bus.getBus(0)!.getModbusAPI(), 1, spec, 1)
      expect(arg0!.identified).toBe(IdentifiedStates.unknown)
    } catch (_e) {
      expect(false).toBeTruthy()
    }
  })
  it('Modbus read Entity identifiation identified', async () => {
    prepareIdentification()
    expect(dev).toBeDefined
    if (ent.converterParameters)
      (ent.converterParameters as Inumber).identification = {
        min: 0.01,
        max: 0.4,
      }
    spec.entities = ents
    const arg0 = await mr.readEntityFromModbus(Bus.getBus(0)!.getModbusAPI(), 1, spec, 1)
    expect(arg0!.identified).toBe(IdentifiedStates.identified)
  })
  it('Modbus read Entity identifiation Iselect identified', async () => {
    prepareIdentification()
    expect(dev).toBeDefined
    Config['config'].fakeModbus = true

    if (ent.converterParameters)
      (ent.converterParameters as Inumber).identification = {
        min: 0.02,
        max: 0.04,
      }
    ent.converter = 'select'
    ent.modbusValue = [1]
    ent.converterParameters = {
      optionModbusValues: [0, 1, 2, 3],
    }
    ent.id = 1
    spec.entities = [ent]
    const arg0 = await mr.readEntityFromModbus(Bus.getBus(0)!.getModbusAPI(), 1, spec, 1)
    expect(arg0!.identified).toBe(IdentifiedStates.identified)
    Config['config'].fakeModbus = true
  })

  it('Modbus read Entity identifiation string not identified', async () => {
    //@ts-ignore
    prepareIdentification()
    Config['config'].fakeModbus = true
    expect(dev).toBeDefined
    if (entText.converterParameters) (entText.converterParameters as Itext).identification = 'test'
    spec.entities = [entText]
    const arg0 = await mr.readEntityFromModbus(Bus.getBus(0)!.getModbusAPI(), 2, spec, 2)
    expect(arg0!.identified).toBe(IdentifiedStates.notIdentified)
  })

  it('Modbus read Entity identifiation string identified', async () => {
    prepareIdentification()
    Config['config'].fakeModbus = true
    //jest.spyOn(Modbus.prototype, 'readHoldingRegister').mockReturnValue([65 << 8 | 66, 67 << 8 | 68])
    expect(dev).toBeDefined
    if (entText.converterParameters) (entText.converterParameters as Itext).identification = 'ABCD'
    dev!.slaveid = 2
    spec.entities = [entText]
    const mb = new Modbus()
    const arg0 = await mb.readEntityFromModbus(Bus.getBus(1)!.getModbusAPI(), 2, spec, 2)
    expect(arg0!.identified).toBe(IdentifiedStates.identified)
  })
  // it("Modbus getUsbDevices", done => {
  //     mr.getUsbDevices();
  //     done();
  // });
})
it.skip('Modbus modbusDataToSpec spec.identified = identified', () => {
  const spec: IfileSpecification = {
    version: '0.1',
    entities: [
      {
        id: 1,
        mqttname: 'mqtt',
        converter: 'number' as Converters,
        modbusAddress: 4,
        registerType: ModbusRegisterType.HoldingRegister,
        readonly: true,
        icon: '',
        converterParameters: {
          multiplier: 0.1,
          offset: 0,
          uom: 'cm',
          identification: { min: 0, max: 200 },
        },
      },
      {
        id: 2,
        mqttname: 'mqtt2',
        converter: 'select_sensor' as Converters,
        modbusAddress: 2,
        registerType: ModbusRegisterType.HoldingRegister,
        readonly: true,
        icon: '',
        converterParameters: {
          options: [
            { key: 1, name: 'cm' },
            { key: 2, name: 'mm' },
            { key: 3, name: 'mPa' },
          ],
        },
      },
      {
        id: 3,
        mqttname: 'mqtt3',
        converter: 'select_sensor' as Converters,
        modbusAddress: 3,
        registerType: ModbusRegisterType.HoldingRegister,
        readonly: true,
        icon: '',
        converterParameters: {
          options: [
            { key: 0, name: '1' },
            { key: 1, name: '0.1' },
            { key: 2, name: '0.01' },
            { key: 3, name: '0.001' },
          ],
        },
      },
    ],
    status: 2,
    manufacturer: 'unknown',
    model: 'QDY30A',

    filename: 'waterleveltransmitter',
    i18n: [],
    files: [
      {
        url: '/documents/waterleveltransmitter.pdf',
        fileLocation: FileLocation.Local,
        usage: SpecificationFileUsage.documentation,
      },
      {
        url: 'https://m.media-amazon.com/images/I/51WMttnsOML._AC_SX569_.jpg',
        fileLocation: FileLocation.Local,
        usage: SpecificationFileUsage.img,
      },
    ],
    testdata: {},
  }
  //"modbusValue": [210], "mqttValue": 21,
  //        "modbusValue": [1], "mqttValue": "cm", "identified": 1,
  //"modbusValue": [1], "mqttValue": "0.1", "identified": 1,
  const results = emptyModbusValues()
  results.holdingRegisters.set(4, getReadRegisterResult(210))
  results.holdingRegisters.set(2, getReadRegisterResult(1))
  results.holdingRegisters.set(3, getReadRegisterResult(1))
  Config.getConfiguration()
  Config['config'].fakeModbus = false
  const m = new ModbusForTest()
  const result = m.modbusDataToSpecForTest(spec)
  debug(JSON.stringify(result))
  expect(result).toBeDefined()
  expect(result!.identified).toBe(IdentifiedStates.identified)
  Config['config'].fakeModbus = true
})

function writeRegisters(slaveid: number, _startaddress: number, registerType: ModbusRegisterType): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    debug('write Registers')
    resolve()
  })
}
it('Modbus writeEntityMqtt', async () => {
  // TODO Fix test ModbusCache.prototype.writeRegisters = writeRegisters
  const readConfig: Config = new Config()
  readConfig.readYaml()
  new ConfigSpecification().readYaml()
  const dev = ConfigBus.getSlave(0, 1)!
  expect(dev).toBeDefined

  try {
    await Modbus.writeEntityMqtt(Bus.getBus(0)!.getModbusAPI(), 1, spec, 3, 'test')
  } catch (e) {
    expect(`[FAIL] ${e}`.trim()).toBeFalsy()
  }
})
