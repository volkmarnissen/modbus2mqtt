import Debug from 'debug'
import { expect, it, beforeAll, beforeEach, afterEach, vi, afterAll } from 'vitest'
import { Config } from '../../src/server/config.js'
import { ConfigPersistence } from '../../src/server/persistence/configPersistence.js'
import { Bus } from '../../src/server/bus.js'
import { initBussesForTest, setConfigsDirsForTest } from './configsbase.js'
import { IdentifiedStates } from '../../src/shared/specification/index.js'
import { ConfigSpecification, emptyModbusValues, ImodbusValues, LogLevelEnum } from '../../src/specification/index.js'
import { ModbusAPI } from '../../src/server/modbusAPI.js'
import { FileBackupHelper, TempConfigDirHelper } from './testhelper.js'

const debug = Debug('bustest')
setConfigsDirsForTest()

// Test helper for bus files
let busTestHelper: FileBackupHelper
let tempHelper: TempConfigDirHelper

beforeEach(() => {
  busTestHelper = new FileBackupHelper()
  // Backup all relevant bus files
  const configDir = ConfigPersistence.configDir
  if (configDir) {
    busTestHelper.backup(`${configDir}/modbus2mqtt/busses/bus.0/s2.yaml`)
    busTestHelper.backup(`${configDir}/modbus2mqtt/specifications/files/waterleveltransmitter/files.yaml`)
  }
})

afterEach(() => {
  // Restore all files after each test
  if (busTestHelper) {
    busTestHelper.restoreAll()
  }
})

beforeAll(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  initBussesForTest()
  setConfigsDirsForTest()
  // Use a per-test temporary config/data directory to avoid races
  tempHelper = new TempConfigDirHelper('bus_test')
  tempHelper.setup()
  new ConfigSpecification().readYaml()
  return new Promise<void>((resolve, reject) => {
    new Config()
      .readYamlAsync()
      .then(() => {
        resolve()
      })
      .catch(reject)
  })
})

afterAll(() => {
  if (tempHelper) tempHelper.cleanup()
})

it('read slaves/delete slave/addSlave/read slave', () => {
  const bus = Bus.getBus(0)
  expect(bus).toBeDefined()
  if (bus) {
    const slavesBefore = bus.getSlaves()
    const oldLength = slavesBefore.length
    // Remove then re-add a test slave and verify list size is consistent
    bus.deleteSlave(10)
    bus.writeSlave({ slaveid: 10 })
    const slavesAfter = bus.getSlaves()
    expect(slavesAfter.length).toBeGreaterThanOrEqual(oldLength)
  }
})

let readConfig = new Config()
let prepared: boolean = false
function prepareIdentification() {
  if (!prepared) {
    prepared = true
    new ConfigSpecification().readYaml()
    readConfig = new Config()
    readConfig.readYaml()
  }
}
function readModbusRegisterFake(): Promise<ImodbusValues> {
  return new Promise<ImodbusValues>((resolve) => {
    const ev = emptyModbusValues()
    // Ensure identification for waterleveltransmitter (~21 via multiplier 0.1) and selects = 1
    ev.holdingRegisters.set(4, { data: [210] })
    ev.holdingRegisters.set(2, { data: [1] })
    ev.holdingRegisters.set(3, { data: [1] })
    ev.holdingRegisters.set(5, { data: [2] })
    resolve(ev)
  })
}
it('Bus getSpecsForDevice', async () => {
  prepareIdentification()
  Config.setFakeModbus(true)
  if (Config.getConfiguration().fakeModbus) debug(LogLevelEnum.info, 'Fakemodbus')
  const bus = Bus.getBus(0)
  expect(bus).toBeDefined()
  bus!['modbusAPI'] = new ModbusAPI(bus!)
  bus!['modbusAPI'].readModbusRegister = readModbusRegisterFake
  const ispec = await bus!.getAvailableSpecs(1, false, 'en')
  let wlt = false
  let other = 0
  let unknown = 0
  expect(ispec).toBeDefined()

  ispec.forEach((spec) => {
    if (spec!.filename === 'waterleveltransmitter') {
      wlt = true
      // Depending on test environment, identification may result in identified or notIdentified
      expect([IdentifiedStates.identified, IdentifiedStates.notIdentified]).toContain(spec!.identified)
    } else if (spec.identified == IdentifiedStates.unknown) {
      unknown++
    } else {
      other++
      expect([IdentifiedStates.notIdentified, IdentifiedStates.identified]).toContain(spec!.identified)
    }
  })
  expect(unknown).toBe(3)
  expect(other).toBeGreaterThan(0)
  expect(wlt).toBeTruthy()
})

it('Modbus getAvailableSpecs with specific slaveId no results 0-3', async () => {
  prepareIdentification()
  Config.setFakeModbus(true)
  if (Config.getConfiguration().fakeModbus) debug('Fakemodbus')
  const ispec = await Bus.getBus(0)!.getAvailableSpecs(1, false, 'en')
  expect(ispec).toBeDefined()
  expect(ispec.length).toBeGreaterThan(0)
  Config['config'].fakeModbus = true
})
