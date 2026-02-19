import { expect, it } from '@jest/globals'
import { ModbusRegisterType } from '../../src/shared/specification/index.js'
import { ModbusRTUProcessor } from '../../src/server/modbusRTUprocessor.js'
import { ModbusRTUQueue } from '../../src/server/modbusRTUqueue.js'
import { ImodbusAddress, ModbusTasks } from '../../src/shared/server/index.js'
function addAddresses(addresses: Set<ImodbusAddress>, registerType: ModbusRegisterType, startAddress: number, endAddress: number) {
  for (let idx = startAddress; idx < endAddress; idx++)
    addresses.add({
      address: idx,
      registerType: registerType,
    })
}
it('prepare', () => {
  const addresses = new Set<ImodbusAddress>()
  addAddresses(addresses, ModbusRegisterType.HoldingRegister, 0, 4)
  addAddresses(addresses, ModbusRegisterType.HoldingRegister, 7, 9)
  addAddresses(addresses, ModbusRegisterType.HoldingRegister, 27, 29)

  addAddresses(addresses, ModbusRegisterType.Coils, 0, 4)

  const queue = new ModbusRTUQueue()
  const modbusProcessor = new ModbusRTUProcessor(queue)
  const preparedAddresses = modbusProcessor['prepare'](1, addresses)
  expect(preparedAddresses.addresses.length).toBe(3)
  expect(preparedAddresses.addresses[0].address).toBe(0)
  expect(preparedAddresses.addresses[0].length).toBe(4)
  expect(preparedAddresses.addresses[0].registerType).toBe(ModbusRegisterType.Coils)
  expect(preparedAddresses.addresses[1].address).toBe(0)
  expect(preparedAddresses.addresses[1].length).toBe(9)
  expect(preparedAddresses.addresses[1].registerType).toBe(ModbusRegisterType.HoldingRegister)
  expect(preparedAddresses.addresses[2].address).toBe(27)
  expect(preparedAddresses.addresses[2].length).toBe(2)
  expect(preparedAddresses.addresses[2].registerType).toBe(ModbusRegisterType.HoldingRegister)
})

it('execute', async () => {
  const addresses = new Set<ImodbusAddress>()
  addAddresses(addresses, ModbusRegisterType.HoldingRegister, 0, 4)
  addAddresses(addresses, ModbusRegisterType.HoldingRegister, 7, 9)
  addAddresses(addresses, ModbusRegisterType.Coils, 0, 4)

  const queue = new ModbusRTUQueue()
  const modbusProcessor = new ModbusRTUProcessor(queue)
  const resultPromise = modbusProcessor.execute(1, addresses, { task: ModbusTasks.deviceDetection, errorHandling: { retry: true } })
  // Wait for queue to be ready
  setTimeout(() => {
    const entries = queue.getEntries()
    queue.clear()
    entries.forEach((qe) => {
      if (qe.address.registerType == ModbusRegisterType.Coils) qe.onResolve(qe, [1, 1, 0, 0])
      else if (qe.address.address == 0 && qe.address.length != undefined && qe.address.length > 1) {
        const e: any = new Error('Timeout')
        e.errno = 'ETIMEDOUT'
        qe.onError(qe, e)
      }
    })
  }, 100)
  const result = await resultPromise
  expect(result.coils.size).toBe(4)
  result.coils.forEach((res) => {
    expect(res.error).not.toBeDefined()
    expect(res.data).toBeDefined()
  })
  expect(result.holdingRegisters.size).toBe(9)
  result.holdingRegisters.forEach((res) => {
    expect(res.error).toBeDefined()
    expect(res.data).not.toBeDefined()
  })
})
