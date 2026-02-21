import { expect, it, test, jest, beforeAll, afterAll } from '@jest/globals'
import { HttpServer as HttpServer } from '../../src/server/httpserver.js'
import { Config } from '../../src/server/config.js'
import { ConfigPersistence } from '../../src/server/persistence/configPersistence.js'
import supertest from 'supertest'
import { ImodbusSpecification } from '../../src/shared/specification/index.js'
import { Bus } from '../../src/server/bus.js'
import { Slave } from '../../src/shared/server/index.js'
import { LogLevelEnum, Logger } from '../../src/specification/index.js'
import { ConfigSpecification } from '../../src/specification/index.js'
import { join } from 'path'
import { ConfigBus } from '../../src/server/configbus.js'
import { Observable, Subject } from 'rxjs'
import { initBussesForTest } from './configsbase.js'
import { MqttSubscriptions } from '../../src/server/mqttsubscriptions.js'
import { setConfigsDirsForTest } from './configsbase.js'
const mockReject = false
const mqttService = {
  host: 'core-mosquitto',
  port: 1883,
  ssl: false,
  protocol: '3.1.1',
  username: 'addons',
  password: 'Euso6ahphaiWei9Aeli6Tei0si2paep5agethohboophe7vae9uc0iebeezohg8e',
  addon: 'core_mosquitto',
  ingress_entry: 'test',
}
function executeHassioGetRequest<T>(_url: string, next: (_dev: T) => void, reject: (error: any) => void): void {
  if (mockReject) reject('mockedReason')
  else next({ data: mqttService } as T)
}

import { TempConfigDirHelper } from './testhelper.js'

const log = new Logger('httpserverTest')
setConfigsDirsForTest()
Config['executeHassioGetRequest'] = executeHassioGetRequest

let httpServer: HttpServer
let tempHelper: TempConfigDirHelper

beforeAll(() => {
  tempHelper = new TempConfigDirHelper('httpserver_slaveservice')
  tempHelper.setup()
  new ConfigSpecification().readYaml()
  return new Promise<void>((resolve) => {
    const cfg = new Config()
    cfg.readYamlAsync().then(() => {
      ConfigBus.readBusses()
      initBussesForTest()
      ;(Config as any)['fakeModbusCache'] = true
      jest.mock('../../src/server/modbus')
      // TODO Fix test: ModbusCache.prototype.submitGetHoldingRegisterRequest = submitGetHoldingRegisterRequest
      HttpServer.prototype.authenticate = (req, res, next) => {
        next()
      }
      httpServer = new HttpServer(join(ConfigPersistence.configDir, 'angular'))

      httpServer.setModbusCacheAvailable()
      httpServer.init()
      resolve()
    })
  })
})
afterAll(() => {
  if (tempHelper) tempHelper.cleanup()
})

class MockMqttSubsctription {
  slave: Slave = new Slave(0, Bus.getBus(0)!.getSlaveBySlaveId(1)!, Config.getConfiguration().mqttbasetopic)
  getSlave(): Slave | undefined {
    return this.slave
  }
  readModbus(slave: Slave): Observable<ImodbusSpecification> | undefined {
    const bus = Bus.getBus(slave.getBusId())
    if (bus) {
      const sub = new Subject<ImodbusSpecification>()
      const f = async function (sub: Subject<ImodbusSpecification>) {
        setTimeout(() => {
          sub.next(slave.getSpecification() as ImodbusSpecification)
        }, 20)
      }
      f(sub)
      return sub
    }
    return undefined
  }
  sendEntityCommandWithPublish(_slave: Slave, topic: string, payload: string): Promise<void> {
    expect(topic.startsWith('/')).toBeFalsy()
    expect(payload).toBe('20.2')
    return new Promise<void>((resolve) => {
      resolve()
    })
  }
  sendCommand(_slave: Slave, payload: string): Promise<void> {
    expect(payload.indexOf('20.2')).not.toBe(-1)
    return new Promise<void>((resolve) => {
      resolve()
    })
  }
}
function prepareMqttDiscover(): MockMqttSubsctription {
  const mockDiscover = new MockMqttSubsctription()
  MqttSubscriptions['instance'] = mockDiscover as any as MqttSubscriptions
  return mockDiscover
}
it('GET state topic', async () => {
  const mockDiscover = prepareMqttDiscover()

  const response = await supertest(httpServer['app']).get('/' + mockDiscover.slave.getStateTopic()).expect(200)
  expect(response.text.indexOf('waterleveltransmitter')).not.toBe(-1)
})

test('GET command Entity topic', async () => {
  const mockDiscover = prepareMqttDiscover()
  ConfigBus.addSpecification(mockDiscover.slave['slave'])
  const spec = mockDiscover.slave.getSpecification()
  let url = '/' + mockDiscover.slave.getEntityCommandTopic(spec!.entities[2] as any)!.commandTopic
  url = url + '20.2'
  await supertest(httpServer['app'])
    .get(url)
    //.send("{hotwatertargettemperature: 20.2}")
    // .send("20.2")
    .expect(200)
})
test('POST command topic', async () => {
  const mockDiscover = prepareMqttDiscover()
  const url = '/' + mockDiscover.slave.getCommandTopic()
  await supertest(httpServer['app'])
    .post(url)
    .send({ hotwatertargettemperature: 20.2 })
    // .send("20.2")
    .expect(200)
})
