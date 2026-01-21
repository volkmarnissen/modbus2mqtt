import EventEmitter from 'events'
import { ImodbusAddress, ModbusErrorStates, ModbusTasks } from '../shared/server/index.js'
const EventNewEntry = 'newEntry'
const EventCachedEntry = 'cachedEntry'
export enum ModbusErrorActions {
  notHandled,
  handledReconnect,
  handledNoReconnect,
}

export interface IQueueEntry {
  slaveId: number
  address: ImodbusAddress
  onResolve: (queueEntry: IQueueEntry, result?: number[]) => void
  onError: (queueEntry: IQueueEntry, e: unknown) => void
  options: IQueueOptions
  errorState?: ModbusErrorStates
  errorCount?: number
  error?: unknown
}
export interface IQueueOptions {
  useCache?: boolean
  task: ModbusTasks
  errorHandling: {
    split?: boolean
    retry?: boolean
  }
}
export class ModbusRTUQueue {
  private eventEmitter = new EventEmitter()
  private list: IQueueEntry[] = []
  constructor() {
    this.list = []
  }
  enqueueEntry(entry: IQueueEntry) {
    //TODO find similar entry in queue
    // if found concat methods to on resolve and onError
    // else push this entry
    this.list.push(entry)
    this.eventEmitter.emit(EventNewEntry)
  }
  enqueue(
    slaveId: number,
    address: ImodbusAddress,
    onResolve: (queueEntry: IQueueEntry, result?: number[]) => void,
    onError: (queueEntry: IQueueEntry, e: unknown) => void,
    options: IQueueOptions
  ) {
    const entry: IQueueEntry = {
      slaveId: slaveId,
      address: address,
      onResolve: onResolve,
      onError: onError,
      options: options,
      errorState: ModbusErrorStates.noerror,
    }
    this.enqueueEntry(entry)
  }
  dequeue(): IQueueEntry | undefined {
    return this.list.shift()
  }
  addNewEntryListener(listener: () => void) {
    this.eventEmitter.addListener(EventNewEntry, listener)
  }
  addCachedEntryListener(listener: (entry: IQueueEntry) => void) {
    this.eventEmitter.addListener<IQueueEntry>(EventCachedEntry, listener)
  }
  clear() {
    this.list = []
  }
  getEntries(): IQueueEntry[] {
    return this.list
  }
  getLength(): number {
    return this.list.length
  }
}
