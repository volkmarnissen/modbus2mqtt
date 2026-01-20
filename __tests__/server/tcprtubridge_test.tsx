import { it, expect, describe, beforeAll, afterAll } from '@jest/globals'
import { ModbusTcpRtuBridge } from '../../src/server/tcprtubridge'
import { ModbusRTUQueue } from '../../src/server/modbusRTUqueue'
import { ModbusRegisterType } from '../../src/shared/specification'
import { FakeBus, ModbusRTUWorkerForTest } from './testhelper'
import ModbusRTU from 'modbus-serial'
import { Mutex } from 'async-mutex'

it('getCoil', () => {
  const queue = new ModbusRTUQueue()
  const bridge = new ModbusTcpRtuBridge(queue)
  bridge['vector']!.getCoil!(1, 2, (err, value) => {
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
  bridge['vector']!.getDiscreteInput!(1, 2, (err, value) => {
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
  bridge['vector']!.setCoil!(1, true, 2, (err) => {
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
  bridge['vector']!.setRegister!(1, 27, 2, (err) => {
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
  bridge['vector']!.getHoldingRegister!(1, 2, (err, value) => {
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
  bridge['vector']!.getInputRegister!(1, 2, (err, value) => {
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
it('getMultipleInputRegisters', (done) => {
  const queue = new ModbusRTUQueue()
  const bridge = new ModbusTcpRtuBridge(queue)
  bridge['vector']!.getMultipleInputRegisters!(1, 3, 2, () => {
    done()
  })

  expect(queue.getLength()).toBe(1)
  expect(queue.getEntries()[0].address.address).toBe(1)
  expect(queue.getEntries()[0].slaveId).toBe(2)
  expect(queue.getEntries()[0].address.length).toBe(3)
  expect(queue.getEntries()[0].address.registerType).toBe(ModbusRegisterType.AnalogInputs)
  expect(queue.getEntries()[0].address.write).not.toBeDefined()
  queue.getEntries()[0].onResolve(queue.getEntries()[0], [198, 198, 198])
})

describe('live tests', () => {
  const client = new ModbusRTU()
  let bridge: ModbusTcpRtuBridge
  let testWorker: ModbusRTUWorkerForTest
  const liveMutext = new Mutex()
  beforeAll(() => {
    return new Promise<void>((resolve) => {
      const queue = new ModbusRTUQueue()
      const fakeBus = new FakeBus()
      testWorker = new ModbusRTUWorkerForTest(fakeBus, queue, () => {}, 'start/stop')
      bridge = new ModbusTcpRtuBridge(queue)
      // open connection to a tcp line
      client.setID(1)
      console.log('startServer')
      bridge.startServer(3010).then(() => {
        console.log('server started')
        setTimeout(() => {
          client
            .connectTCP('127.0.0.1', { port: 3010 })
            .then(() => {
              console.log('connected')
              resolve()
            })
            .catch((e: any) => {
              console.log(e.message)
            })
        }, 200)
      })
    })
  })

  afterAll(() => {
    bridge.stopServer()
  })
  it('live readHoldingRegisters', (done) => {
    liveMutext.runExclusive(() => {
      // submit a request
      client
        .readHoldingRegisters(2, 4)
        .then((value) => {
          expect(value.data.length).toBe(4)
          done()
        })
        .catch((e) => {
          expect(false).toBeTruthy()
        })
    })
  })
  it('live readDiscreteInputs', (done) => {
    liveMutext.runExclusive(() => {
      // submit a request
      client
        .readDiscreteInputs(2, 4)
        .then((value) => {
          expect(value.data[0]).toBeFalsy()
          done()
        })
        .catch((e) => {
          expect(false).toBeTruthy()
        })
    })
  })
  it('live writeHoldingRegister', (done) => {
    liveMutext.runExclusive(() => {
      // submit a request
      testWorker.expectedAPIcallCount = 1
      testWorker.expectedAPIwroteDataCount = 1
      testWorker['done'] = done
      client
        .writeRegister(2, 1)
        .then(() => {
          console.log('We are back')
        })
        .catch((e) => {
          expect(false).toBeTruthy()
        })
    })
  })
})
