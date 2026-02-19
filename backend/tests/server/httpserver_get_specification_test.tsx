import { expect, it, beforeAll, afterAll } from '@jest/globals'
import { startModbusTCPserver, stopModbusTCPServer } from '../../src/server/modbusTCPserver.js'

import { HttpErrorsEnum, ImodbusSpecification } from '../../src/shared/specification/index.js'
import { FakeMqtt, FakeModes, setConfigsDirsBackendTCPForTest, initBussesForTest } from './configsbase.js'
import supertest from 'supertest'
import { apiUri } from '../../src/shared/server/index.js'
import { HttpServer } from '../../src/server/httpserver.js'
import { Config } from '../../src/server/config.js'
import { ConfigBus } from '../../src/server/configbus.js'
import { MqttClient } from 'mqtt'
import { join } from 'path'
import { ConfigSpecification } from '../../src/specification/index.js'
import { MqttSubscriptions } from '../../src/server/mqttsubscriptions.js'
import { MqttConnector } from '../../src/server/mqttconnector.js'
let httpServer: HttpServer

beforeAll(async() => {
 
  // fake MQTT: avoid reconnect
    setConfigsDirsBackendTCPForTest()

    const conn = new MqttConnector()
    const msub = new MqttSubscriptions(conn)

    const fake = new FakeMqtt(msub, FakeModes.Poll)
    conn.getMqttClient = function (onConnectCallback: (connection: MqttClient) => void) {
      onConnectCallback(fake as any as MqttClient)
    }
    new ConfigSpecification().readYaml()
    const cfg = new Config()
    await cfg.readYamlAsync()
      ConfigBus.readBusses()
      initBussesForTest()
      HttpServer.prototype.authenticate = (req, res, next) => {
        next()
      }
    await startModbusTCPserver(ConfigSpecification.configDir, ConfigSpecification.dataDir, 0)
          httpServer = new HttpServer(join(ConfigSpecification.configDir, 'angular'))
          httpServer.setModbusCacheAvailable()
          httpServer.init()
})
afterAll(() => {
  stopModbusTCPServer()
})

it('Discrete Inputs definition provided check', async () => {
  if (httpServer){
    const response = await supertest(httpServer['app'])
      .get(apiUri.modbusSpecification + '?busid=0&slaveid=3&spec=lc-technology-relay-input')
      .expect(HttpErrorsEnum.OK)
    const spec: ImodbusSpecification = response.body  
        expect(spec.entities).toBeDefined()
        expect(spec.entities.length).toEqual(16)
        expect(spec.entities[0].registerType).toEqual(2)
  }
})

it('Coils definition provided check', async () => {
  if (httpServer){
    const response = await supertest(httpServer['app'])
      .get(apiUri.modbusSpecification + '?busid=0&slaveid=3&spec=lc-technology-relay-input')
      .expect(HttpErrorsEnum.OK)
        const spec: ImodbusSpecification = response.body

    expect(spec.entities).toBeDefined()
    expect(spec.entities.length).toEqual(16)
    expect(spec.entities[8].registerType).toEqual(1)
  }
})
