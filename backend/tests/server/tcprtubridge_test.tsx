import { it, expect, describe, beforeAll, afterAll } from '@jest/globals'
import { ModbusTcpRtuBridge } from '../../src/server/tcprtubridge.js'
import { ModbusRTUQueue } from '../../src/server/modbusRTUqueue.js'
import { ModbusRegisterType } from '../../src/shared/specification/index.js'
import { FakeBus, getAvailablePort, ModbusRTUWorkerForTest } from './testhelper.js'
import ModbusRTU from 'modbus-serial'
import { Mutex } from 'async-mutex'

it('getCoil', () => {
  const queue = new ModbusRTUQueue()
  const bridge = new ModbusTcpRtuBridge(queue)
  bridge['vector']!.getCoil!(1, 2, () => {
    expect(queue.getLength()).toBe(1)
    expect(queue.getEntries()[0].address.address).toBe(1)
    expect(queue.getEntries()[0].slaveId).toBe(2)
    expect(queue.getEntries()[0].address.length).toBe(1)
    expect(queue.getEntries()[0].address.registerType).toBe(ModbusRegisterType.Coils)
  })
})
it('getDiscreteInput', () => {
  const queue = new ModbusRTUQueue()
  const bridge = new ModbusTcpRtuBridge(queue)
  bridge['vector']!.getDiscreteInput!(1, 2, () => {
    expect(queue.getLength()).toBe(1)
    expect(queue.getEntries()[0].address.address).toBe(1)
    expect(queue.getEntries()[0].slaveId).toBe(2)
    expect(queue.getEntries()[0].address.length).toBe(1)
    expect(queue.getEntries()[0].address.registerType).toBe(ModbusRegisterType.DiscreteInputs)
  })
})
it('setCoil', () => {
  const queue = new ModbusRTUQueue()
  const bridge = new ModbusTcpRtuBridge(queue)
  bridge['vector']!.setCoil!(1, true, 2, () => {
    expect(queue.getLength()).toBe(1)
    expect(queue.getEntries()[0].address.address).toBe(1)
    expect(queue.getEntries()[0].slaveId).toBe(2)
    expect(queue.getEntries()[0].address.length).toBe(1)
    expect(queue.getEntries()[0].address.registerType).toBe(ModbusRegisterType.Coils)
    expect(queue.getEntries()[0].address.write).toEqual([1])
  })
})
it('setRegister', () => {
  const queue = new ModbusRTUQueue()
  const bridge = new ModbusTcpRtuBridge(queue)
  bridge['vector']!.setRegister!(1, 27, 2, () => {
    expect(queue.getLength()).toBe(1)
    expect(queue.getEntries()[0].address.address).toBe(1)
    expect(queue.getEntries()[0].slaveId).toBe(2)
    expect(queue.getEntries()[0].address.length).toBe(1)
    expect(queue.getEntries()[0].address.registerType).toBe(ModbusRegisterType.HoldingRegister)
    expect(queue.getEntries()[0].address.write).toEqual([27])
  })
})
it('getHoldingRegister', () => {
  const queue = new ModbusRTUQueue()
  const bridge = new ModbusTcpRtuBridge(queue)
  bridge['vector']!.getHoldingRegister!(1, 2, () => {
    expect(queue.getLength()).toBe(1)
    expect(queue.getEntries()[0].address.address).toBe(1)
    expect(queue.getEntries()[0].slaveId).toBe(2)
    expect(queue.getEntries()[0].address.length).toBe(1)
    expect(queue.getEntries()[0].address.registerType).toBe(ModbusRegisterType.HoldingRegister)
    expect(queue.getEntries()[0].address.write).not.toBeDefined()
  })
})
it('getInputRegister', () => {
  const queue = new ModbusRTUQueue()
  const bridge = new ModbusTcpRtuBridge(queue)
  bridge['vector']!.getInputRegister!(1, 2, () => {
    expect(queue.getLength()).toBe(1)
    expect(queue.getEntries()[0].address.address).toBe(1)
    expect(queue.getEntries()[0].slaveId).toBe(2)
    expect(queue.getEntries()[0].address.length).toBe(1)
    expect(queue.getEntries()[0].address.registerType).toBe(ModbusRegisterType.AnalogInputs)
    expect(queue.getEntries()[0].address.write).not.toBeDefined()
  })
})
it('getMultipleHoldingRegisters', () => {
  const queue = new ModbusRTUQueue()
  const bridge = new ModbusTcpRtuBridge(queue)
  ;(bridge['vector']!.getMultipleHoldingRegisters as (addr: number, length: number, unitID: number) => Promise<boolean>)(1, 3, 2)
  expect(queue.getLength()).toBe(1)
  expect(queue.getEntries()[0].address.address).toBe(1)
  expect(queue.getEntries()[0].slaveId).toBe(2)
  expect(queue.getEntries()[0].address.length).toBe(3)
  expect(queue.getEntries()[0].address.registerType).toBe(ModbusRegisterType.HoldingRegister)
  expect(queue.getEntries()[0].address.write).not.toBeDefined()
})
it('getMultipleInputRegisters', async () => {
  const queue = new ModbusRTUQueue()
  const bridge = new ModbusTcpRtuBridge(queue)
  let resolveDone: (() => void) | undefined
  const donePromise = new Promise<void>((resolve) => {
    resolveDone = resolve
  })
  bridge['vector']!.getMultipleInputRegisters!(1, 3, 2, () => {
    resolveDone && resolveDone()
  })

  expect(queue.getLength()).toBe(1)
  expect(queue.getEntries()[0].address.address).toBe(1)
  expect(queue.getEntries()[0].slaveId).toBe(2)
  expect(queue.getEntries()[0].address.length).toBe(3)
  expect(queue.getEntries()[0].address.registerType).toBe(ModbusRegisterType.AnalogInputs)
  expect(queue.getEntries()[0].address.write).not.toBeDefined()
  queue.getEntries()[0].onResolve(queue.getEntries()[0], [198, 198, 198])
  await donePromise
})

describe('live tests', () => {
  const client = new ModbusRTU()
  let bridge: ModbusTcpRtuBridge
  let testWorker: ModbusRTUWorkerForTest
  const liveMutext = new Mutex()
  let livePort = 0
  beforeAll(async () => {
    livePort = await getAvailablePort()
      const queue = new ModbusRTUQueue()
      const fakeBus = new FakeBus()
      testWorker = new ModbusRTUWorkerForTest(fakeBus, queue, () => {}, 'start/stop')
      bridge = new ModbusTcpRtuBridge(queue)
      // open connection to a tcp line
      client.setID(1)
      console.log('startServer')
      await bridge.startServer(livePort)
     
      await client
            .connectTCP('127.0.0.1', { port: livePort })
            console.log('connected')
  })

  afterAll(() => {
    client.close(() => undefined)
    bridge.stopServer()
  })
  it('live readHoldingRegisters', async () => {
    await liveMutext.runExclusive(async () => {
      const value = await client.readHoldingRegisters(2, 4)
      expect(value.data.length).toBe(4)
    })
  })

  it('live readDiscreteInputs', async () => {
    await liveMutext.runExclusive(async () => {
      const value = await client.readDiscreteInputs(2, 4)
      expect(value.data[0]).toBeFalsy()
    })
  })

  it('live writeRegisters', async () => {
    await liveMutext.runExclusive(async () => {
      testWorker.expectedAPIcallCount = 1
      testWorker.expectedAPIwroteDataCount = 1
      const donePromise = new Promise<void>((resolve, reject) => {
        testWorker['done'] = (err?: any) => {
          if (err) reject(err)
          else resolve()
        }
      })
      await client.writeRegisters(2, [200])
      await donePromise
    })
  })
})
