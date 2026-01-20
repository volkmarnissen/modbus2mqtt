import { IBus, IRTUConnection, ITCPConnection } from './types.js'

export function getBusName(bus: IBus): string {
  const serialport = (bus.connectionData as IRTUConnection).serialport
  if (serialport) return serialport
  const tcpname = (bus.connectionData as ITCPConnection).host + ':' + (bus.connectionData as ITCPConnection).port
  return tcpname
}
