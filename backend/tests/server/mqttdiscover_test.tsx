/* eslint-disable vitest/no-disabled-tests */
import { Config } from '../../src/server/config.js'
import {
  ImodbusEntity,
  ImodbusSpecification,
  ModbusRegisterType,
  VariableTargetParameters,
} from '../../src/shared/specification/index.js'
import { ItopicAndPayloads, MqttDiscover } from '../../src/server/mqttdiscover.js'
import { MqttClient } from 'mqtt'
import { FakeModes, FakeMqtt, initBussesForTest, setConfigsDirsForTest } from './configsbase.js'
import { Bus } from '../../src/server/bus.js'
import Debug from 'debug'
import { ConfigSpecification, Logger } from '../../src/specification/index.js'
import { expect, test, beforeAll, vi, afterAll } from 'vitest'
import { Islave, Slave } from '../../src/shared/server/index.js'
import { ConfigBus } from '../../src/server/configbus.js'
import { Modbus } from '../../src/server/modbus.js'
import { MqttConnector } from '../../src/server/mqttconnector.js'
import { MqttSubscriptions } from '../../src/server/mqttsubscriptions.js'
import { TempConfigDirHelper } from './testhelper.js'
const debug = Debug('mqttdiscover_test')

class MdFakeMqtt extends FakeMqtt {
  public override publish(topic: string, message: Buffer): void {
    if (topic.endsWith('/availabitlity/')) {
      debug('publish ' + topic + '\n' + message)
    } else if (topic.endsWith('/state/')) {
      // a state topic
      switch (this.fakeMode) {
        case FakeModes.Poll:
          expect(message.length).not.toBe(0)
          this.isAsExpected = true
          break
      }
    }
    debug('publish: ' + topic + '\n' + message)
  }
}

let oldLog: any
let slave: Islave
let spec: ImodbusSpecification
const selectTestId = 3
const selectTestWritableId = 5
let msub1: MqttSubscriptions
const selectTest: ImodbusEntity = {
  id: selectTestWritableId,
  mqttname: 'selecttestWr',
  modbusAddress: 7,
  registerType: ModbusRegisterType.HoldingRegister,
  readonly: true,
  converter: 'select',
  modbusValue: [],
  mqttValue: '300',
  identified: 1,
  converterParameters: { optionModbusValues: [1, 2, 3] },
}

const selectTestWritable: ImodbusEntity = {
  id: selectTestId,
  mqttname: 'selecttest',
  modbusAddress: 1,
  registerType: ModbusRegisterType.HoldingRegister,
  readonly: false,
  converter: 'select',
  modbusValue: [],
  mqttValue: '300',
  identified: 1,
  converterParameters: { optionModbusValues: [1, 2, 3] },
}
let mqttDiscoverTestHelper: TempConfigDirHelper
beforeAll(async () => {
  // Fix ModbusCache ModbusCache.prototype.submitGetHoldingRegisterRequest = submitGetHoldingRegisterRequest
  oldLog = Logger.prototype.log
  setConfigsDirsForTest()
  Config['config'] = {} as any

  const conn = new MqttConnector()
  msub1 = new MqttSubscriptions(conn)
  // Ensure ConfigBus events are subscribed before busses/slaves are loaded
  // so that subscribedSlaves gets populated during init.
  new MqttDiscover(conn, msub1)
  // trigger subscription to ConfigBus Events
  setConfigsDirsForTest()
  mqttDiscoverTestHelper = new TempConfigDirHelper('httpserver-test')
  mqttDiscoverTestHelper.setup()
  initBussesForTest()
  const fake = new FakeMqtt(msub1, FakeModes.Poll)
  conn['client'] = fake as any as MqttClient
  conn['connectMqtt'] = function () {
    conn['onConnect'](conn['client']!)
  }

  const readConfig: Config = new Config()
  await readConfig.readYamlAsync()
  Config.setFakeModbus(true)
  new ConfigSpecification().readYaml()
  ConfigBus.readBusses()
  const bus = Bus.getBus(0)
  spec = {} as ImodbusSpecification
  slave = {
    specificationid: 'deye',
    slaveid: 2,
    pollInterval: 100,
  }

  const serialNumber: ImodbusEntity = {
    id: 0,
    mqttname: 'serialnumber',
    variableConfiguration: {
      targetParameter: VariableTargetParameters.deviceIdentifiers,
    },
    converter: 'text',
    modbusValue: [],
    mqttValue: '123456',
    identified: 1,
    converterParameters: { stringlength: 12 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  const currentSolarPower: ImodbusEntity = {
    id: 1,
    mqttname: 'currentpower',
    converter: 'number',
    modbusValue: [],
    mqttValue: '300',
    identified: 1,
    converterParameters: { uom: 'kW' },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: true,
    modbusAddress: 2,
  }
  spec.filename = 'deye'
  spec.manufacturer = 'Deye'
  spec.model = 'SUN-10K-SG04LP3-EU'
  spec.i18n = [{ lang: 'en', texts: [] }]
  spec.i18n[0].texts = [
    { textId: 'name', text: 'Deye Inverter' },
    { textId: 'e1', text: 'Current Power' },
    { textId: 'e3', text: 'Select Test' },
    { textId: 'e3o.1', text: 'Option 1' },
    { textId: 'e3o.2', text: 'Option 2' },
    { textId: 'e3o.3', text: 'Option 3' },
    { textId: 'e5', text: 'Select Test' },
    { textId: 'e5o.1', text: 'Option 1' },
    { textId: 'e5o.2', text: 'Option 2' },
    { textId: 'e5o.3', text: 'Option 3' },
  ]
  spec.entities = []
  spec.entities.push(serialNumber)
  spec.entities.push(currentSolarPower)
  spec.entities.push(selectTest)
  slave.specification = spec as any
  new ConfigSpecification().writeSpecification(spec as any, () => {}, spec.filename)
  bus!.writeSlave(slave)
})
afterAll(() => {
  Logger.prototype.log = oldLog
  mqttDiscoverTestHelper.cleanup()
})

// function spyMqttOnMessage(ev: string, _cb: Function): MqttClient {
//   if (ev === 'message') {
//     for (let tp of tps) {
//       md!['onMqttMessage'](tp.topic, Buffer.from(tp.payload as string, 'utf8'))
//     }
//   }
//   return md!['client'] as MqttClient
// }

test('Discover', async () => {
  const conn = new MqttConnector()
  const disc = new MqttDiscover(conn, msub1)
  expect(msub1['subscribedSlaves'].length).toBeGreaterThan(3)

  Config['config'].mqttusehassio = false
  await new Config().getMqttConnectOptions().then(() => {
    const s = structuredClone(spec)
    s.entities.push(selectTestWritable)

    const payloads: ItopicAndPayloads[] = disc['generateDiscoveryPayloads'](
      new Slave(0, slave, Config.getConfiguration().mqttbasetopic),
      s
    )
    expect(payloads.length).toBe(3)
    const payloadCurrentPower = JSON.parse(payloads[0].payload as string)
    const payloadSelectTestPower = JSON.parse(payloads[1].payload as string)
    expect(payloadCurrentPower.name).toBe('Current Power')
    expect(payloadCurrentPower.unit_of_measurement).toBe('kW')
    expect(payloadSelectTestPower.device.name).toBe('Deye Inverter')
    expect(payloadSelectTestPower.name).toBe('Select Test')
    expect(payloadSelectTestPower.options).not.toBeDefined()
    expect(payloads[1].topic.indexOf('/sensor/')).toBeGreaterThan(0)
    const payloadSelectTestWritable = JSON.parse(payloads[2].payload as string)
    expect(payloads[2].topic.indexOf('/select/')).toBeGreaterThan(0)
    expect(payloadSelectTestWritable.device_class).toBe('enum')
    expect(payloadSelectTestWritable.options).toBeDefined()
    expect(payloadSelectTestWritable.options.length).toBeGreaterThan(0)
    expect(payloadSelectTestWritable.command_topic).toBeDefined()
    const pl = JSON.parse(payloads[0].payload as string)
    //expect(pl.unit_of_measurement).toBe("kW");
    expect(pl.device.manufacturer).toBe(spec.manufacturer)
    expect(pl.device.model).toBe(spec.model)
    return
  })
})
// test("pollIntervallToMilliSeconds", (done) => {
//     new Config().getMqttConnectOptions().then((options) => {
//         let md = new MqttDiscover(options,"en");
//         expect(md['pollIntervallToMilliSeconds']("5 min") as any).toBe(5 * 60 * 1000);
//         expect(md['pollIntervallToMilliSeconds']("5 sec") as any).toBe(5 * 1000);
//         expect(md['pollIntervallToMilliSeconds']("15 sec") as any).toBe(15 * 1000);
//         done();
//     });

// });
test.skip('validateConnection success', () => {
  const md = new MqttConnector()
  md.validateConnection(undefined, (valid) => {
    expect(valid).toBeTruthy()
  })
})

test.skip('validateConnection invalid port', () => {
  const options = Config.getConfiguration().mqttconnect
  options.mqttserverurl = 'mqtt://localhost:999'
  options.connectTimeout = 200
  const md = new MqttConnector()
  md.validateConnection(undefined, (valid) => {
    expect(valid).toBeFalsy()
  })
})

test('selectConverter adds modbusValue to statePayload', () => {
  expect(msub1['subscribedSlaves'].length).toBeGreaterThan(3)
  const specEntity: ImodbusEntity = {
    id: 1,
    modbusValue: [3],
    mqttValue: 'Some Text',
    identified: 1,
    mqttname: 'selectTest',
    converter: 'select',
    readonly: false,
    registerType: ModbusRegisterType.HoldingRegister,
    modbusAddress: 44,
    converterParameters: {
      options: [{ key: 3, name: 'Some Text' }],
    },
  }
  const spec: ImodbusSpecification = { entities: [specEntity] } as any as ImodbusSpecification
  const sl = new Slave(0, { slaveid: 0 }, Config.getConfiguration().mqttbasetopic)
  sl.getStatePayload(spec.entities)
  const payload = JSON.parse(sl.getStatePayload(spec.entities))
  expect(payload.modbusValues).toBeDefined()
  expect(payload.modbusValues.selectTest).toBe(3)
})
test('onCommandTopic', () => {
  Config.setFakeModbus(true)
  Config['config'].mqttusehassio = false
  const rc = msub1['onMqttCommandMessage']('m2m/set/0s1/e1/modbusValues', Buffer.from('[3]', 'utf8'))
  expect(rc).toBe('Modbus [3]')
})

test('onMessage TriggerPollTopic from this app', async () => {
  expect(msub1['subscribedSlaves'].length).toBeGreaterThan(3)
  const conn = new MqttConnector()
  const sub = new MqttSubscriptions(conn)
  const fake = new MdFakeMqtt(sub, FakeModes.Poll)
  conn.getMqttClient = function (onConnectCallback: (connection: MqttClient) => void) {
    onConnectCallback(fake as any as MqttClient)
  }
  copySubscribedSlaves(sub['subscribedSlaves'], msub1['subscribedSlaves'])
  const sl = new Slave(0, { slaveid: 3 }, Config.getConfiguration().mqttbasetopic)
  fake.fakeMode = FakeModes.Poll
  await sub['onMqttMessage'](sl.getTriggerPollTopic(), Buffer.from(' '))
    .then(() => {
      expect(fake.isAsExpected).toBeTruthy()
    })
    .catch((e) => {
      console.log('Error' + e.message)
      expect(false).toBeTruthy()
    })
})

class FakeMqttSendCommandTopic extends FakeMqtt {
  public override publish(topic: string, message: Buffer): void {
    if (topic.endsWith('/state/')) {
      expect(message.length).not.toBe(0)
      this.isAsExpected = true
    }
    debug('publish: ' + topic + '\n' + message)
  }
}
function copySubscribedSlaves(toA: Slave[], fromA: Slave[]) {
  fromA.forEach((s) => {
    ConfigBus.addSpecification(s['slave'])
    toA.push(s.clone())
  })
}
test.skip('onMessage SendEntityCommandTopic from this app', async () => {
  expect(msub1['subscribedSlaves'].length).toBeGreaterThan(3)
  const conn = new MqttConnector()
  const sub = new MqttSubscriptions(conn)
  copySubscribedSlaves(sub['subscribedSlaves'], msub1['subscribedSlaves'])
  const fake = new FakeMqttSendCommandTopic(sub, FakeModes.Poll)
  conn.getMqttClient = function (onConnectCallback: (connection: MqttClient) => void) {
    onConnectCallback(fake as any as MqttClient)
  }
  const bus = Bus.getBus(0)
  const slave = structuredClone(bus!.getSlaveBySlaveId(1))
  ConfigBus.addSpecification(slave!)
  // Ensure entity index exists and is writable/select
  const enArr = (slave!.specification!.entities = slave!.specification!.entities || [])
  const idx = 2
  if (!enArr[idx]) {
    enArr[idx] = {
      id: 999,
      mqttname: 'temp',
      converter: 'select',
      modbusAddress: 0,
      registerType: ModbusRegisterType.HoldingRegister,
      readonly: false,
      modbusValue: [],
      mqttValue: '',
      identified: 0,
      converterParameters: { optionModbusValues: [1] },
    } as any
  }
  ;(slave!.specification!.entities[idx] as any).converter = 'select'
  const spec = slave!.specification!
  const sl = new Slave(0, slave!, Config.getConfiguration().mqttbasetopic)
  slave!.specification!.entities[idx].readonly = false
  const oldwriteEntityMqtt = Modbus.writeEntityMqtt
  const writeEntityMqttMock = vi.fn().mockImplementation(() => Promise.resolve())
  Modbus.writeEntityMqtt = writeEntityMqttMock as any
  const en: any = spec!.entities[idx]
  // Normalize topic: some paths include a trailing slash, strip it to match subscription lookup
  const entityCmdTopic = sl.getEntityCommandTopic(en)!.commandTopic!.replace(/\/$/, '')
  // For select entities, use an allowed option key
  await sub['onMqttMessage'](entityCmdTopic, Buffer.from('1'))
    .then(() => {
      expect(fake.isAsExpected).toBeTruthy()
      expect(writeEntityMqttMock).toHaveBeenCalled()
      Modbus.writeEntityMqtt = oldwriteEntityMqtt
    })
    .catch((e) => {
      debug('Error' + e.message)
      expect(false).toBeTruthy()
    })
})
test.skip('onMessage SendCommandTopic from this app', async () => {
  expect(msub1['subscribedSlaves'].length).toBeGreaterThan(3)
  const conn = new MqttConnector()
  const sub = new MqttSubscriptions(conn)
  const fake = new FakeMqttSendCommandTopic(sub, FakeModes.Poll)
  conn.getMqttClient = function (onConnectCallback: (connection: MqttClient) => void) {
    onConnectCallback(fake as any as MqttClient)
  }
  const oldwriteEntityMqtt = Modbus.writeEntityMqtt
  const writeEntityMqttMock = vi.fn().mockImplementation(() => Promise.resolve())
  Modbus.writeEntityMqtt = writeEntityMqttMock as any

  conn['connectMqtt'] = function () {
    conn['onConnect'](conn['client']!)
  }
  const bus = Bus.getBus(0)
  const slave = structuredClone(bus!.getSlaveBySlaveId(1))
  ConfigBus.addSpecification(slave!)
  copySubscribedSlaves(sub['subscribedSlaves'], msub1['subscribedSlaves'])

  const sl = new Slave(0, slave!, Config.getConfiguration().mqttbasetopic)
  const idx = 2
  const enArr = (slave!.specification!.entities = slave!.specification!.entities || [])
  if (!enArr[idx]) {
    enArr[idx] = {
      id: 999,
      mqttname: 'temp',
      converter: 'select',
      modbusAddress: 0,
      registerType: ModbusRegisterType.HoldingRegister,
      readonly: false,
      modbusValue: [],
      mqttValue: '',
      identified: 0,
      converterParameters: { optionModbusValues: [1] },
    } as any
  }
  slave!.specification!.entities[idx].readonly = false
  const cmdTopic = sl.getCommandTopic()!.replace(/\/$/, '')
  await sub['onMqttMessage'](cmdTopic, Buffer.from('{ "hotwatertargettemperature": 20.2 }'))
    .then(() => {
      expect(writeEntityMqttMock).toHaveBeenCalled()
      Modbus.writeEntityMqtt = oldwriteEntityMqtt
      expect(fake.isAsExpected).toBeTruthy()
    })
    .catch((e) => {
      debug('Error' + e.message)
      expect(false).toBeTruthy()
    })
})
test.skip('onMessage SendCommand with modbusValues', async () => {
  expect(msub1['subscribedSlaves'].length).toBeGreaterThan(3)
  const conn = new MqttConnector()
  const sub = new MqttSubscriptions(conn)
  copySubscribedSlaves(sub['subscribedSlaves'], msub1['subscribedSlaves'])
  const fake = new FakeMqttSendCommandTopic(sub, FakeModes.Poll)
  conn.getMqttClient = function (onConnectCallback: (connection: MqttClient) => void) {
    onConnectCallback(fake as any as MqttClient)
  }
  const oldwriteEntityMqtt = Modbus.writeEntityMqtt
  const writeEntityModbusMock = vi.fn().mockImplementation(() => Promise.resolve())
  Modbus.writeEntityModbus = writeEntityModbusMock as any

  conn['connectMqtt'] = function () {
    conn['onConnect'](conn['client']!)
  }
  const bus = Bus.getBus(0)
  const slave = structuredClone(bus!.getSlaveBySlaveId(1))
  ConfigBus.addSpecification(slave!)
  const sl = new Slave(0, slave!, Config.getConfiguration().mqttbasetopic)
  const topicCandidate = sl.getCommandTopic()
  const cmdTopic2 = (topicCandidate ? topicCandidate.replace(/\/$/, '') : sl.getCommandTopic())!
  await sub['onMqttMessage'](cmdTopic2, Buffer.from('{ "modbusValues": { "operatingmode": 2 }}'))
    .then(() => {
      expect(writeEntityModbusMock).toHaveBeenCalled()
      Modbus.writeEntityMqtt = oldwriteEntityMqtt
      expect(fake.isAsExpected).toBeTruthy()
    })
    .catch((e) => {
      debug('Error' + e.message)
      expect(false).toBeTruthy()
    })
})

// test('onAddSlave/onUpdateSlave/onDeleteSlave', (done) => {
//   expect(msub1['subscribedSlaves'].length).toBeGreaterThan(3)
//   let conn = new MqttConnector()
//   let mdl = new MqttDiscover(conn)
//   copySubscribedSlaves(mdl['subscribedSlaves'], msub1['subscribedSlaves'])
//   let slaveCount = mdl['subscribedSlaves'].length
//   let fake: FakeMqtt = new FakeMqttAddSlaveTopic(mdl, FakeModes.Poll)
//   conn['client'] = fake as any as MqttClient
//   conn['connectMqtt'] = function (undefined) {
//     conn['onConnect'](conn['client']!)
//   }
//   let spec = ConfigSpecification['specifications'].find((s: Ispecification) => s.filename == 'deyeinverterl') as Ispecification
//   let slave: Islave = { slaveid: 7, specificationid: 'deyeinverterl', specification: spec as any, name: 'wl2', rootTopic: 'wl2' }
//   mdl['onUpdateSlave'](new Slave(0, slave, Config.getConfiguration().mqttbasetopic))
//     .then(() => {
//       expect(mdl['subscribedSlaves'].length).toBe(slaveCount + 1)
//       expect(fake.isAsExpected).toBeTruthy()
//       let s1 = mdl['subscribedSlaves'].find((s) => s.getSlaveId() == 7)!.clone()
//       spec = ConfigSpecification['specifications'].find((s: Ispecification) => s.filename == s1.getSpecificationId()!) as any
//       let oldSpec = structuredClone(spec)
//       // delete an entity

//       let s3 = s1.clone()
//       ConfigBus.addSpecification(s3['slave'])
//       s3['slave'].specification.entities.splice(0, 1)
//       fake = new FakeMqttDeleteEntitySlave(mdl, FakeModes.Poll)
//       mdl['client'] = fake as any as MqttClient
//       // onUpdateSlave with removed entity
//       mdl['onUpdateSlave'](s3).then(() => {
//         expect(fake.isAsExpected).toBeTruthy()
//         expect(mdl['subscribedSlaves'].find((s) => s.getSlaveId() == 7)!.getSpecification()!.entities.length).toBe(1)
//         // onUpdateSlave with added entity
//         let s2 = s3.clone()
//         s2.getSpecification()!.entities.push(numberTest)
//         fake = new FakeMqttAddEntitySlave(mdl, FakeModes.Poll)
//         mdl['client'] = fake as any as MqttClient
//         mdl['onUpdateSlave'](s2).then(() => {
//           expect(fake.isAsExpected).toBeTruthy()
//           expect(mdl['subscribedSlaves'].find((s) => s.getSlaveId() == 7)!.getSpecification()!.entities.length).toBe(2)
//           fake = new FakeMqttDeleteSlaveTopic(mdl, FakeModes.Poll)
//           mdl['client'] = fake as any as MqttClient
//           mdl['onDeleteSlave'](new Slave(0, slave, Config.getConfiguration().mqttbasetopic))
//             .then(() => {
//               expect(mdl['subscribedSlaves'].length).toBe(slaveCount)
//               expect(fake.isAsExpected).toBeTruthy()
//               done()
//             })
//             .catch((e) => {
//               debug(e.message)
//               done()
//             })
//         })
//       })
//     })
//     .catch((e) => {
//       debug(e.message)
//       done()
//     })
// })
