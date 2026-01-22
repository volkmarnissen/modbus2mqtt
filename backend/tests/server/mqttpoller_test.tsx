import { Config } from '../../src/server/config.js'
import { ImodbusEntity, ModbusRegisterType } from '../../src/shared/specification/index.js'
import { ItopicAndPayloads, MqttDiscover } from '../../src/server/mqttdiscover.js'
import { MqttClient } from 'mqtt'
import { FakeModes, FakeMqtt, initBussesForTest, setConfigsDirsForTest } from './configsbase.js'
import { Bus } from '../../src/server/bus.js'
import Debug from 'debug'
import { expect, test, beforeAll } from 'vitest'
import { Islave, Slave } from '../../src/shared/server.js'
import { ConfigBus } from '../../src/server/configbus.js'
import { MqttConnector } from '../../src/server/mqttconnector.js'
import { MqttPoller } from '../../src/server/mqttpoller.js'
import { MqttSubscriptions } from '../../src/server/mqttsubscriptions.js'
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

let slave: Islave
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

interface IfakeDiscovery {
  conn: MqttConnector
  mdl: MqttPoller
  msub: MqttSubscriptions
  md: MqttDiscover
  fake: FakeMqtt
}

function getFakeDiscovery(): IfakeDiscovery {
  const conn = new MqttConnector()
  const msub = new MqttSubscriptions(conn)
  const rc: IfakeDiscovery = {
    conn: conn,
    mdl: new MqttPoller(conn),
    msub: msub,
    md: new MqttDiscover(conn, msub),
    fake: new FakeMqtt(msub, FakeModes.Poll),
  }
  rc.conn.getMqttClient = function (onConnectCallback: (connection: MqttClient) => void) {
    onConnectCallback(rc.fake as any as MqttClient)
  }
  return rc
}
let fakeDiscovery: IfakeDiscovery

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
beforeAll(async () => {
  // Fix ModbusCache ModbusCache.prototype.submitGetHoldingRegisterRequest = submitGetHoldingRegisterRequest
  setConfigsDirsForTest()
  Config['config'] = {} as any
  const readConfig: Config = new Config()
  await readConfig.readYamlAsync()
  fakeDiscovery = getFakeDiscovery()
  initBussesForTest()
})

test('poll', async () => {
  const fd = getFakeDiscovery()
  copySubscribedSlaves(fd.msub['subscribedSlaves'], fakeDiscovery.msub['subscribedSlaves'])
  await fd.mdl['poll']!(Bus.getBus(0)!)
  expect(fd.fake.isAsExpected).toBeTruthy()
  expect(fd.mdl!['slavePollInfo'].size).toBeGreaterThan(0)
  let c = fd.mdl!['slavePollInfo'].values().next()
  expect(c.value!.count).toBeGreaterThan(0)
  fd.fake = new FakeMqtt(fd.msub!, FakeModes.Poll2)
  // second call should do nothing, because interval is too short
  fd.conn['client'] = fd.fake as any as MqttClient
  fd.fake.isAsExpected = true
  const m = new Map<number, ItopicAndPayloads>()
  m.set(1, topic4Deletion)
  const sl = new Slave(1, { slaveid: 0 }, Config.getConfiguration().mqttbasetopic)
  expect(fd.msub['subscribedSlaves'].length).toBeGreaterThan(3)
  fd.msub['subscribedSlaves'].push(sl)
  expect(fd.msub['subscribedSlaves'].length).toBeGreaterThan(3)
  await fd.mdl!['poll'](Bus.getBus(0)!)
  expect(fd.fake.isAsExpected).toBeTruthy()
  c = fd.mdl!['slavePollInfo'].values().next()
  fd.mdl!['slavePollInfo'].set(1, { count: 10000, processing: false })
  expect(c.value!.count).toBeGreaterThan(1)
  //call discovery explicitly
  const bus = Bus.getBus(0)
  fd.fake.isAsExpected = false
  fd.fake.fakeMode = FakeModes.Discovery
  const slave = bus?.getSlaveBySlaveId(1)
  await fd.mdl!['poll'](Bus.getBus(0)!)
  const ss = fd.msub['subscribedSlaves'].find((s) => Slave.compareSlaves(s, sl) == 0)
})

test('poll with processing=true for all slaves', async () => {
  const fd = getFakeDiscovery()
  initBussesForTest()
  fd.mdl!['slavePollInfo'].set(1, { count: 0, processing: true })
  fd.mdl!['slavePollInfo'].set(2, { count: 0, processing: true })
  fd.mdl!['slavePollInfo'].set(3, { count: 0, processing: true })
  fd.fake.isAsExpected = false
  await fd.mdl!['poll']!(Bus.getBus(0)!)
  expect(fd.mdl!['slavePollInfo'].get(1)!.processing).toBeTruthy()
  expect(fd.fake.isAsExpected).toBeFalsy()
})

test('poll with processing= true for first Slave', async () => {
  const fd = getFakeDiscovery()
  fd.mdl!['slavePollInfo'].set(1, { count: 0, processing: true })
  fd.mdl!['slavePollInfo'].set(2, { count: 0, processing: false })
  fd.mdl!['slavePollInfo'].set(3, { count: 0, processing: false })
  fd.fake.isAsExpected = false
  await fd.mdl!['poll']!(Bus.getBus(0)!)
  expect(fd.mdl!['slavePollInfo'].get(1)!.processing).toBeTruthy()
  expect(fd.fake.isAsExpected).toBeTruthy()
})

test('poll counter resets at threshold and allows re-polling', async () => {
  const fd = getFakeDiscovery()
  copySubscribedSlaves(fd.msub['subscribedSlaves'], fakeDiscovery.msub['subscribedSlaves'])

  // Initial poll at count 0
  await fd.mdl['poll']!(Bus.getBus(0)!)
  const pollInfo1 = fd.mdl!['slavePollInfo'].get(1)
  expect(pollInfo1).toBeDefined()
  expect(pollInfo1!.count).toBeGreaterThan(0)

  // Simulate reaching the threshold (default is 50)
  fd.mdl!['slavePollInfo'].set(1, { count: 50, processing: false })

  fd.fake.isAsExpected = false
  fd.fake.fakeMode = FakeModes.Poll

  await fd.mdl['poll']!(Bus.getBus(0)!)
  expect(fd.fake.isAsExpected).toBeTruthy()
  const pollInfo2 = fd.mdl!['slavePollInfo'].get(1)
  expect(pollInfo2).toBeDefined()
  expect(pollInfo2!.count).toBeGreaterThan(0)
  expect(pollInfo2!.count).toBeLessThan(50)
})
