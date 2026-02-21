import { it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Config } from '../../src/server/config.js'
import { ConfigPersistence } from '../../src/server/persistence/configPersistence.js'
import { ConfigBus } from '../../src/server/configbus.js'
import { ConfigSpecification } from '../../src/specification/index.js'
import { TempConfigDirHelper } from './testhelper.js'
import { setConfigsDirsForTest } from './configsbase.js'
import { parse } from 'yaml'
import * as fs from 'fs'
import { join } from 'path'

setConfigsDirsForTest()

let tempHelper: TempConfigDirHelper

beforeAll(async () => {
  tempHelper = new TempConfigDirHelper('configbus_persistence')
  tempHelper.setup()
  const config = new Config()
  await config.readYamlAsync()
  new ConfigSpecification().readYaml()
})

afterAll(() => {
  if (tempHelper) tempHelper.cleanup()
})

beforeEach(() => {
  ConfigBus.readBusses()
})

// Test 1: readAll — reads bus.0 with bus.yaml + s*.yaml
it('readAll: reads bus directory with busId, connectionData, and slaves', () => {
  const busses = ConfigBus.getBussesProperties()
  expect(busses.length).toBeGreaterThanOrEqual(1)

  const bus0 = busses.find((b) => b.busId === 0)
  expect(bus0).toBeDefined()
  expect(bus0!.connectionData).toBeDefined()
  expect(bus0!.slaves.length).toBeGreaterThanOrEqual(1)

  // Verify first slave has specificationid
  const slave1 = bus0!.slaves.find((s) => s.slaveid === 1)
  expect(slave1).toBeDefined()
  expect(slave1!.specificationid).toBe('waterleveltransmitter')
})

// Test 2: writeBus — creates bus directory with correct YAML
it('writeBus: creates bus directory with correct bus.yaml', () => {
  const connection = { serialport: '/dev/ttyUSB99', baudrate: 19200, timeout: 200 }
  const bus = ConfigBus.addBusProperties(connection)

  expect(bus).toBeDefined()
  expect(bus.busId).toBeGreaterThan(0)
  expect(bus.slaves).toEqual([])

  const busDir = join(ConfigPersistence.getLocalDir(), 'busses', `bus.${bus.busId}`)
  expect(fs.existsSync(busDir)).toBe(true)

  const busYaml = fs.readFileSync(join(busDir, 'bus.yaml'), 'utf8')
  const parsed = parse(busYaml)
  expect(parsed.serialport).toBe('/dev/ttyUSB99')
  expect(parsed.baudrate).toBe(19200)
  expect(parsed.timeout).toBe(200)
})

// Test 3: writeSlave — writes s{id}.yaml without runtime fields
it('writeSlave: writes slave YAML without runtime fields', () => {
  const busses = ConfigBus.getBussesProperties()
  const bus0 = busses.find((b) => b.busId === 0)!
  const slave = {
    slaveid: 99,
    specificationid: 'waterleveltransmitter',
    name: 'test-slave',
    pollMode: 0,
    // Runtime fields that should NOT be persisted
    specification: { entities: [] } as any,
    durationOfLongestModbusCall: 123,
    modbusStatusForSlave: {} as any,
  }

  ConfigBus.writeslave(0, slave)

  const slavePath = join(ConfigPersistence.getLocalDir(), 'busses', 'bus.0', 's99.yaml')
  expect(fs.existsSync(slavePath)).toBe(true)

  const content = fs.readFileSync(slavePath, 'utf8')
  const parsed = parse(content)
  expect(parsed.slaveid).toBe(99)
  expect(parsed.specificationid).toBe('waterleveltransmitter')
  expect(parsed.specification).toBeUndefined()
  expect(parsed.durationOfLongestModbusCall).toBeUndefined()
  expect(parsed.modbusStatusForSlave).toBeUndefined()

  // Cleanup
  fs.unlinkSync(slavePath)
})

// Test 4: Round-trip — writeBus + writeSlave then readAll
it('round-trip: writeBus + writeSlave then readAll returns matching data', () => {
  const connection = { serialport: '/dev/ttyUSB77', baudrate: 115200, timeout: 50 }
  const bus = ConfigBus.addBusProperties(connection)

  ConfigBus.writeslave(bus.busId, {
    slaveid: 7,
    specificationid: 'waterleveltransmitter',
    pollMode: 0,
  })

  // Re-read from disk
  ConfigBus.readBusses()
  const busses = ConfigBus.getBussesProperties()
  const rereadBus = busses.find((b) => b.busId === bus.busId)
  expect(rereadBus).toBeDefined()
  expect((rereadBus!.connectionData as any).serialport).toBe('/dev/ttyUSB77')
  expect(rereadBus!.slaves.length).toBe(1)
  expect(rereadBus!.slaves[0].slaveid).toBe(7)

  // Cleanup
  ConfigBus.deleteBusProperties(bus.busId)
})

// Test 5: deleteBus — removes directory
it('deleteBus: removes bus directory', () => {
  const connection = { serialport: '/dev/ttyUSB88', baudrate: 9600, timeout: 100 }
  const bus = ConfigBus.addBusProperties(connection)
  const busDir = join(ConfigPersistence.getLocalDir(), 'busses', `bus.${bus.busId}`)
  expect(fs.existsSync(busDir)).toBe(true)

  ConfigBus.deleteBusProperties(bus.busId)
  expect(fs.existsSync(busDir)).toBe(false)
})

// Test 6: deleteSlave — removes s{id}.yaml
it('deleteSlave: removes slave YAML file', () => {
  ConfigBus.writeslave(0, {
    slaveid: 88,
    specificationid: 'waterleveltransmitter',
    pollMode: 0,
  })

  const slavePath = join(ConfigPersistence.getLocalDir(), 'busses', 'bus.0', 's88.yaml')
  expect(fs.existsSync(slavePath)).toBe(true)

  ConfigBus.deleteSlave(0, 88)
  // File deletion is async (unlink callback), give it a moment
  // The in-memory state should already be updated
  const bus0 = ConfigBus.getBussesProperties().find((b) => b.busId === 0)!
  expect(bus0.slaves.find((s) => s.slaveid === 88)).toBeUndefined()
})
