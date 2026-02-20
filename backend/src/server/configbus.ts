import { IBus, IModbusConnection, Islave, Slave } from '../shared/server/index.js'
import { ConfigSpecification, Logger, LogLevelEnum } from '../specification/index.js'
import { getSpecificationI18nEntityName, IidentEntity, Ispecification } from '../shared/specification/index.js'

import Debug from 'debug'
import { Config, ConfigListenerEvent } from './config.js'
import { SerialPort } from 'serialport'
import { BusPersistence } from './persistence/busPersistence.js'
import * as fs from 'fs'
const log = new Logger('config')
const debug = Debug('configbus')

interface HassioHardwareInfo {
  data: {
    devices: Array<{
      subsystem?: string
      dev_path: string
    }>
  }
}

export class ConfigBus {
  private static busses: IBus[]
  private static persistence: BusPersistence
  private static listeners: {
    event: ConfigListenerEvent
    listener: ((arg: Slave, spec: Ispecification | undefined) => void) | ((arg: number) => void)
  }[] = []

  private static persistenceLocalDir: string = ''

  private static ensurePersistence(): BusPersistence {
    const localDir = Config.getLocalDir()
    if (!ConfigBus.persistence || ConfigBus.persistenceLocalDir !== localDir) {
      ConfigBus.persistence = new BusPersistence(localDir)
      ConfigBus.persistenceLocalDir = localDir
    }
    return ConfigBus.persistence
  }

  static addListener(event: ConfigListenerEvent, listener: ((arg: Slave) => void) | ((arg: number) => void)) {
    ConfigBus.listeners.push({ event: event, listener: listener })
  }
  private static emitSlaveEvent(event: ConfigListenerEvent, arg: Slave) {
    ConfigBus.listeners.forEach((eventListener) => {
      if (eventListener.event == event)
        (eventListener.listener as (arg: Slave) => Promise<void>)(arg)
          .then(() => {
            debug('Event listener executed')
          })
          .catch((e) => {
            log.log(LogLevelEnum.error, 'Unable to call event listener: ' + e.message)
          })
    })
  }
  private static emitBusEvent(event: ConfigListenerEvent, arg: number) {
    ConfigBus.listeners.forEach((eventListener) => {
      if (eventListener.event == event) (eventListener.listener as (arg: number) => void)(arg)
    })
  }

  static resetForE2E(): void {
    ConfigBus.busses = []
    ConfigBus.listeners = []
    ConfigBus.persistence = undefined as unknown as BusPersistence
  }

  static getBussesProperties(): IBus[] {
    return ConfigBus.busses
  }

  static readBusses() {
    ConfigBus.busses = []
    const persistence = ConfigBus.ensurePersistence()
    const busData = persistence.readAll()

    busData.forEach((bus) => {
      ConfigBus.busses.push(bus)
      bus.slaves.forEach((slave) => {
        ConfigBus.addSpecification(slave)
        ConfigBus.emitSlaveEvent(
          ConfigListenerEvent.addSlave,
          new Slave(bus.busId, slave, Config.getConfiguration().mqttbasetopic)
        )
      })
    })

    debug('config: busses.length: ' + ConfigBus.busses.length)
  }

  getInstance(): ConfigBus {
    ConfigBus.busses = ConfigBus.busses && ConfigBus.busses.length > 0 ? ConfigBus.busses : []
    return new ConfigBus()
  }

  static addBusProperties(connection: IModbusConnection): IBus {
    let maxBusId = -1
    ConfigBus.busses.forEach((b) => {
      if (b.busId > maxBusId) maxBusId = b.busId
    })
    maxBusId++
    log.log(LogLevelEnum.info, 'AddBusProperties: ' + maxBusId)
    const busArrayIndex =
      ConfigBus.busses.push({
        busId: maxBusId,
        connectionData: connection,
        slaves: [],
      }) - 1

    ConfigBus.ensurePersistence().writeBus(maxBusId, connection)
    return ConfigBus.busses[busArrayIndex]
  }

  static updateBusProperties(bus: IBus, connection: IModbusConnection): IBus {
    bus.connectionData = connection
    ConfigBus.ensurePersistence().writeBus(bus.busId, connection)
    return bus
  }

  static deleteBusProperties(busid: number) {
    const idx = ConfigBus.busses.findIndex((b) => b.busId == busid)
    if (idx >= 0) {
      ConfigBus.emitBusEvent(ConfigListenerEvent.deleteBus, busid)
      ConfigBus.busses.splice(idx, 1)
      ConfigBus.ensurePersistence().deleteBusDir(busid)
    }
  }

  static async filterAllslaves<T>(busid: number, specFunction: <T>(slave: Islave) => Set<T>): Promise<Set<T>> {
    const addresses = new Set<T>()
    for (const slave of ConfigBus.busses[busid].slaves) {
      for (const addr of specFunction<T>(slave)) addresses.add(addr)
    }
    return addresses
  }

  static getIdentityEntities(spec: Ispecification, language?: string): IidentEntity[] {
    return spec.entities.map((se) => {
      let name: string | undefined = undefined
      if (language) {
        const n = getSpecificationI18nEntityName(spec, language, se.id)
        if (n == null) name = undefined
        else name = n
      }
      return {
        id: se.id,
        readonly: se.readonly,
        name: name,
        mqttname: se.mqttname ? se.mqttname : 'unknown',
      }
    })
  }

  static addSpecification(slave: Islave): void {
    const spec = ConfigSpecification.getSpecificationByFilename(slave.specificationid)
    slave.specification = spec
  }

  static writeslave(busid: number, slave: Islave): void {
    const filename = Config.getFileNameFromSlaveId(slave.slaveid)

    ConfigBus.ensurePersistence().writeSlave(busid, slave)

    if (slave.specificationid) {
      ConfigBus.addSpecification(slave)
      const o = new Slave(busid, slave, Config.getConfiguration().mqttbasetopic)
      ConfigBus.emitSlaveEvent(ConfigListenerEvent.updateSlave, o)
    } else debug('No Specification found for slave: ' + filename + ' specification: ' + slave.specificationid)
  }

  static getSlave(busid: number, slaveid: number): Islave | undefined {
    if (ConfigBus.busses.length <= busid) {
      debug('Config.getslave: unknown bus')
      return undefined
    }
    const rc = ConfigBus.busses[busid].slaves.find((dev) => {
      return dev.slaveid === slaveid
    })
    if (!rc) debug('slaves.length: ' + ConfigBus.busses[busid].slaves.length)
    for (const dev of ConfigBus.busses[busid].slaves) {
      debug(dev.name)
    }
    return rc
  }
  static getslaveBySlaveId(busid: number, slaveId: number) {
    const rc = ConfigBus.busses[busid].slaves.find((dev) => {
      return dev.slaveid === slaveId
    })
    return rc
  }

  static deleteSlave(busid: number, slaveid: number) {
    const bus = ConfigBus.busses.find((bus) => bus.busId == busid)
    if (bus != undefined) {
      debug('DELETE /slave slaveid' + busid + '/' + slaveid + ' number of slaves: ' + bus.slaves.length)
      let found = false
      for (let idx = 0; idx < bus.slaves.length; idx++) {
        const slave = bus.slaves[idx]

        if (slave.slaveid === slaveid) {
          found = true
          ConfigBus.ensurePersistence().deleteSlaveFile(busid, slave)
          ConfigBus.addSpecification(slave)
          const o = new Slave(busid, slave, Config.getConfiguration().mqttbasetopic)
          ConfigBus.emitSlaveEvent(ConfigListenerEvent.deleteSlave, o)
          bus.slaves.splice(idx, 1)
          debug('DELETE /slave finished ' + slaveid + ' number of slaves: ' + bus.slaves.length)
          return
        }
      }
      if (!found) debug('slave not found for deletion ' + slaveid)
    } else {
      const msg = 'Unable to delete slave. Check server log for details'
      log.log(LogLevelEnum.error, msg + ' busid ' + busid + ' not found')

      throw new Error(msg)
    }
  }

  private static listDevicesUdev(next: (devices: string[]) => void, reject: (error: Error) => void): void {
    SerialPort.list()
      .then((portInfo) => {
        const devices: string[] = []
        portInfo.forEach((port) => {
          devices.push(port.path)
        })
        next(devices)
      })

      .catch((error: unknown) => {
        reject(error instanceof Error ? error : new Error(String(error)))
      })
  }

  private static grepDevices(bodyObject: HassioHardwareInfo): string[] {
    const devices = bodyObject.data.devices
    const rc: string[] = []
    devices.forEach((device) => {
      if (device.subsystem === 'tty')
        try {
          fs.accessSync(device.dev_path, fs.constants.R_OK)
          rc.push(device.dev_path)
        } catch (e) {
          log.log(LogLevelEnum.error, 'Permission denied for read serial device %s %s', device.dev_path, String(e))
        }
    })
    return rc
  }
  private static listDevicesHassio(next: (devices: string[]) => void, reject: () => void): void {
    Config.executeHassioGetRequest<HassioHardwareInfo>(
      '/hardware/info',
      (dev) => {
        next(ConfigBus.grepDevices(dev))
      },
      reject
    )
  }

  static listDevices(next: (devices: string[]) => void, reject: () => void): void {
    try {
      ConfigBus.listDevicesHassio(next, () => {
        this.listDevicesUdev(next, reject)
      })
    } catch {
      try {
        this.listDevicesUdev(next, reject)
      } catch {
        next([])
      }
    }
  }
}
