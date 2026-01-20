import { Config } from '../../src/server/config'
import { ImodbusEntity, ImodbusSpecification, ModbusRegisterType, VariableTargetParameters } from '../../src/shared/specification'
import { ItopicAndPayloads, MqttDiscover } from '../../src/server/mqttdiscover'
import { MqttClient } from 'mqtt'
import { FakeModes, FakeMqtt, initBussesForTest, setConfigsDirsForTest } from './configsbase'
import { Bus } from '../../src/server/bus'
import Debug from 'debug'
import { ConfigSpecification, Logger } from '../../src/specification'
import { expect, test, beforeAll, jest, xtest } from '@jest/globals'
import { Islave, Slave } from '../../src/shared/server'
import { ConfigBus } from '../../src/server/configbus'
import { Modbus } from '../../src/server/modbus'
import { MqttConnector } from '../../src/server/mqttconnector'
import { MqttSubscriptions } from '../../src/server/mqttsubscriptions'
const debug = Debug('mqttdiscover_test')

const topic4Deletion = {
  topic: 'homeassistant/sensor/1s0/e1/topic4Deletion',
  payload: '',
  entityid: 1,
}
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
const numberTestId = 4
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

beforeAll((done) => {
  // Fix ModbusCache ModbusCache.prototype.submitGetHoldingRegisterRequest = submitGetHoldingRegisterRequest
  oldLog = Logger.prototype.log
  setConfigsDirsForTest()
  Config['config'] = {} as any

  const conn = new MqttConnector()
  msub1 = new MqttSubscriptions(conn)
  // trigger subscription to ConfigBus Events
  const md = new MqttDiscover(conn, msub1)
  initBussesForTest()
  const fake = new FakeMqtt(msub1, FakeModes.Poll)
  conn['client'] = fake as any as MqttClient
  conn['connectMqtt'] = function (undefined) {
    conn['onConnect'](conn['client']!)
  }

  const readConfig: Config = new Config()
  readConfig.readYamlAsync().then(() => {
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

    done()
  })
})
const numberTest: ImodbusEntity = {
  id: numberTestId,
  mqttname: 'mqtt',
  modbusAddress: 2,
  registerType: ModbusRegisterType.HoldingRegister,
  readonly: true,
  converter: 'number',
  modbusValue: [],
  mqttValue: '300',
  identified: 1,
  converterParameters: { multiplier: 1, offset: 0, uom: 'kW' },
}

const tps: ItopicAndPayloads[] = []
// function spyMqttOnMessage(ev: string, _cb: Function): MqttClient {
//   if (ev === 'message') {
//     for (let tp of tps) {
//       md!['onMqttMessage'](tp.topic, Buffer.from(tp.payload as string, 'utf8'))
//     }
//   }
//   return md!['client'] as MqttClient
// }

test('Discover', (done) => {
  const conn = new MqttConnector()
  const disc = new MqttDiscover(conn, msub1)
  expect(msub1['subscribedSlaves'].length).toBeGreaterThan(3)

  Config['config'].mqttusehassio = false
  new Config().getMqttConnectOptions().then((options) => {
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
    done()
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
xtest('validateConnection success', (done) => {
  const options = Config.getConfiguration().mqttconnect

  const md = new MqttConnector()
  md.validateConnection(undefined, (valid, message) => {
    expect(valid).toBeTruthy()
    done()
  })
})

xtest('validateConnection invalid port', (done) => {
  const options = Config.getConfiguration().mqttconnect
  options.mqttserverurl = 'mqtt://localhost:999'
  options.connectTimeout = 200
  const md = new MqttConnector()
  md.validateConnection(undefined, (valid, message) => {
    expect(valid).toBeFalsy()
    done()
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

test('onMessage TriggerPollTopic from this app', (done) => {
  expect(msub1['subscribedSlaves'].length).toBeGreaterThan(3)
  const conn = new MqttConnector()
  const sub = new MqttSubscriptions(conn)
  const mdl = new MqttDiscover(conn, sub)
  const fake = new MdFakeMqtt(sub, FakeModes.Poll)
  conn.getMqttClient = function (onConnectCallback: (connection: MqttClient) => void) {
    onConnectCallback(fake as any as MqttClient)
  }
  copySubscribedSlaves(sub['subscribedSlaves'], msub1['subscribedSlaves'])
  const sl = new Slave(0, { slaveid: 3 }, Config.getConfiguration().mqttbasetopic)
  fake.fakeMode = FakeModes.Poll
  sub['onMqttMessage'](sl.getTriggerPollTopic(), Buffer.from(' '))
    .then(() => {
      // expect a state topic (FakeModes.Poll)
      expect(fake.isAsExpected).toBeTruthy()
      done()
    })
    .catch((e) => {
      console.log('Error' + e.message)
      expect(false).toBeTruthy()
      done()
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
    if (s['slave'] && s['slave'].specification && s['slave'].specification.entities)
      s['slave'].specification.entities.forEach((e: any) => {
        e.converter = 'select'
      })
    toA.push(s.clone())
  })
}
test('onMessage SendEntityCommandTopic from this app', (done) => {
  expect(msub1['subscribedSlaves'].length).toBeGreaterThan(3)
  const conn = new MqttConnector()
  const sub = new MqttSubscriptions(conn)
  copySubscribedSlaves(sub['subscribedSlaves'], msub1['subscribedSlaves'])
  const mdl = new MqttDiscover(conn, sub)
  const fake = new FakeMqttSendCommandTopic(sub, FakeModes.Poll)
  conn.getMqttClient = function (onConnectCallback: (connection: MqttClient) => void) {
    onConnectCallback(fake as any as MqttClient)
  }
  const bus = Bus.getBus(0)
  const slave = structuredClone(bus!.getSlaveBySlaveId(1))
  ConfigBus.addSpecification(slave!)
  ;(slave!.specification?.entities[2] as any).converter = 'select'
  const spec = slave!.specification!
  const sl = new Slave(0, slave!, Config.getConfiguration().mqttbasetopic)
  slave!.specification!.entities[2].readonly = false
  const oldwriteEntityMqtt = Modbus.writeEntityMqtt
  const writeEntityMqttMock = jest.fn().mockImplementation(() => Promise.resolve())
  Modbus.writeEntityMqtt = writeEntityMqttMock as any
  const en: any = spec!.entities[2]
  sub['onMqttMessage'](sl.getEntityCommandTopic(en)!.commandTopic!, Buffer.from('20.2'))
    .then(() => {
      expect(fake.isAsExpected).toBeTruthy()
      expect(writeEntityMqttMock).toHaveBeenCalled()
      Modbus.writeEntityMqtt = oldwriteEntityMqtt

      done()
    })
    .catch((e) => {
      debug('Error' + e.message)
      expect(false).toBeTruthy()
      done()
    })
})
test('onMessage SendCommandTopic from this app', (done) => {
  expect(msub1['subscribedSlaves'].length).toBeGreaterThan(3)
  const conn = new MqttConnector()
  const sub = new MqttSubscriptions(conn)
  const mdl = new MqttDiscover(conn, sub)
  const fake = new FakeMqttSendCommandTopic(sub, FakeModes.Poll)
  conn.getMqttClient = function (onConnectCallback: (connection: MqttClient) => void) {
    onConnectCallback(fake as any as MqttClient)
  }
  const oldwriteEntityMqtt = Modbus.writeEntityMqtt
  const writeEntityMqttMock = jest.fn().mockImplementation(() => Promise.resolve())
  Modbus.writeEntityMqtt = writeEntityMqttMock as any

  conn['connectMqtt'] = function (undefined) {
    conn['onConnect'](conn['client']!)
  }
  const bus = Bus.getBus(0)
  const slave = structuredClone(bus!.getSlaveBySlaveId(1))
  ConfigBus.addSpecification(slave!)
  copySubscribedSlaves(sub['subscribedSlaves'], msub1['subscribedSlaves'])

  const sl = new Slave(0, slave!, Config.getConfiguration().mqttbasetopic)
  slave!.specification!.entities[2].readonly = false
  sub['onMqttMessage'](sl.getCommandTopic()!, Buffer.from('{ "hotwatertargettemperature": 20.2 }'))
    .then(() => {
      expect(writeEntityMqttMock).toHaveBeenCalled()
      Modbus.writeEntityMqtt = oldwriteEntityMqtt

      expect(fake.isAsExpected).toBeTruthy()
      done()
    })
    .catch((e) => {
      debug('Error' + e.message)
      expect(false).toBeTruthy()
      done()
    })
})
test('onMessage SendCommand with modbusValues', (done) => {
  expect(msub1['subscribedSlaves'].length).toBeGreaterThan(3)
  const conn = new MqttConnector()
  const sub = new MqttSubscriptions(conn)
  copySubscribedSlaves(sub['subscribedSlaves'], msub1['subscribedSlaves'])
  const mdl = new MqttDiscover(conn, sub)
  const fake = new FakeMqttSendCommandTopic(sub, FakeModes.Poll)
  conn.getMqttClient = function (onConnectCallback: (connection: MqttClient) => void) {
    onConnectCallback(fake as any as MqttClient)
  }
  const oldwriteEntityMqtt = Modbus.writeEntityMqtt
  const writeEntityModbusMock = jest.fn().mockImplementation(() => Promise.resolve())
  Modbus.writeEntityModbus = writeEntityModbusMock as any

  conn['connectMqtt'] = function (undefined) {
    conn['onConnect'](conn['client']!)
  }
  const bus = Bus.getBus(0)
  const slave = structuredClone(bus!.getSlaveBySlaveId(1))
  const sl = new Slave(0, slave!, Config.getConfiguration().mqttbasetopic)
  sub['onMqttMessage'](sl.getCommandTopic()!, Buffer.from('{ "modbusValues": { "operatingmode": 2 }}'))
    .then(() => {
      expect(writeEntityModbusMock).toHaveBeenCalled()
      Modbus.writeEntityMqtt = oldwriteEntityMqtt

      expect(fake.isAsExpected).toBeTruthy()
      done()
    })
    .catch((e) => {
      debug('Error' + e.message)
      expect(false).toBeTruthy()
      done()
    })
})
class FakeMqttAddSlaveTopic extends FakeMqtt {
  private discoveryIsPublished: boolean = false
  private stateIsPublished: boolean = false
  public override publish(topic: string, message: Buffer): void {
    if (topic.startsWith('homeassistant')) {
      expect(message.length).not.toBe(0)
      this.discoveryIsPublished = true
    }
    if (topic.endsWith('/state/')) {
      expect(message.length).not.toBe(0)
      this.stateIsPublished = true
      if (this.stateIsPublished && this.discoveryIsPublished) this.isAsExpected = true
    }
    debug('publish: ' + topic + '\n' + message)
  }
}

class FakeMqttDeleteSlaveTopic extends FakeMqtt {
  private discoveryIsUnPublished: boolean = false
  private unsubscribed: boolean = false

  public override publish(topic: string, message: Buffer): void {
    if (topic.startsWith('homeassistant')) {
      expect(message.length).toBe(0)
      this.discoveryIsUnPublished = true
    }
    if (this.unsubscribed && this.discoveryIsUnPublished) this.isAsExpected = true
  }
  public override unsubscribe(topic: string | string[]): void {
    if ((topic as string).startsWith('wl2')) {
      this.unsubscribed = true
      if (this.unsubscribed && this.discoveryIsUnPublished) this.isAsExpected = true
    }
  }
}
class FakeMqttDeleteEntitySlave extends FakeMqtt {
  private discoveryIsUnPublished: boolean = false
  //  private unsubscribed: boolean = false

  public override publish(topic: string, message: Buffer): void {
    if (topic.startsWith('homeassistant')) {
      if (message.length == 0) this.discoveryIsUnPublished = true
    }
    this.isAsExpected = this.discoveryIsUnPublished
  }
}
class FakeMqttAddEntitySlave extends FakeMqtt {
  private discoveryIsPublished: number = 0
  private unsubscribed: boolean = false

  public override publish(topic: string, message: Buffer): void {
    if (topic.startsWith('homeassistant')) {
      expect(message.length).not.toBe(0)
      this.discoveryIsPublished++
    }
    this.isAsExpected = !this.unsubscribed && this.discoveryIsPublished == 2
  }
  public override unsubscribe(topic: string | string[]): void {
    this.unsubscribed = true
    this.isAsExpected = !this.unsubscribed && this.discoveryIsPublished == 2
  }
}

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
