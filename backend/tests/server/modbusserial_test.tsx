import ModbusRTU from 'modbus-serial'
import { it } from '@jest/globals'

const client = new ModbusRTU()
it.skip('For hardware test only modbus write', () => {
  // open connection to a serial port
  client.connectRTUBuffered('/dev/ttyUSB0', { baudRate: 9600 }).then(read)
  client.setTimeout(4000)
  client.setID(2)

  function read() {
    // read the 2 registers starting at address 5
    // on device number 1.
    client
      .readHoldingRegisters(123, 1)
      .then(() => {
        // console.log('read: ' + data.data)
      })
      .catch((err: any) => {
        console.log(err)
      })
  }
})
