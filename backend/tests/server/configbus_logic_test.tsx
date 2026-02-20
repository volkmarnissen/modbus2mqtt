import { it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest'
import { Config, ConfigListenerEvent } from '../../src/server/config.js'
import { ConfigBus } from '../../src/server/configbus.js'
import { ConfigSpecification } from '../../src/specification/index.js'
import { TempConfigDirHelper } from './testhelper.js'
import { setConfigsDirsForTest } from './configsbase.js'
import { Slave } from '../../src/shared/server/index.js'

setConfigsDirsForTest()

let tempHelper: TempConfigDirHelper

beforeAll(async () => {
  tempHelper = new TempConfigDirHelper('configbus_logic')
  tempHelper.setup()
  const config = new Config()
  await config.readYamlAsync()
  new ConfigSpecification().readYaml()
})

afterAll(() => {
  if (tempHelper) tempHelper.cleanup()
})

beforeEach(() => {
  ConfigBus.resetForE2E()
  ConfigBus.readBusses()
})

// Test 7: getBussesProperties returns all busses
it('getBussesProperties: returns all busses from store', () => {
  const busses = ConfigBus.getBussesProperties()
  expect(busses.length).toBeGreaterThanOrEqual(1)
  expect(busses[0].busId).toBeDefined()
  expect(busses[0].connectionData).toBeDefined()
})

// Test 8: getSlave returns correct slave
it('getSlave: returns correct slave by busId and slaveId', () => {
  const slave = ConfigBus.getSlave(0, 1)
  expect(slave).toBeDefined()
  expect(slave!.slaveid).toBe(1)
  expect(slave!.specificationid).toBe('waterleveltransmitter')
})

// Test 9: Listener called on updateSlave and deleteSlave events
it('listener: called on updateSlave and deleteSlave events', () => {
  const updateListener = vi.fn().mockResolvedValue(undefined)
  const deleteListener = vi.fn().mockResolvedValue(undefined)

  ConfigBus.addListener(ConfigListenerEvent.updateSlave, updateListener)
  ConfigBus.addListener(ConfigListenerEvent.deleteSlave, deleteListener)

  // writeslave emits updateSlave event
  ConfigBus.writeslave(0, {
    slaveid: 55,
    specificationid: 'waterleveltransmitter',
    pollMode: 0,
  })
  expect(updateListener).toHaveBeenCalled()

  // Add slave to in-memory bus so deleteSlave can find it
  const bus0 = ConfigBus.getBussesProperties().find((b) => b.busId === 0)!
  bus0.slaves.push({ slaveid: 55, specificationid: 'waterleveltransmitter', pollMode: 0 })

  ConfigBus.deleteSlave(0, 55)
  expect(deleteListener).toHaveBeenCalled()
})
