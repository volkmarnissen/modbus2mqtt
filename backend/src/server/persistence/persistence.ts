/**
 * Persistence interfaces for filesystem abstraction.
 * Business classes use these interfaces; implementations handle filesystem I/O.
 */

/** Persistence for a single object (e.g., configuration). */
export interface ISingletonPersistence<T> {
  read(): Promise<T | undefined>
  write(item: T): void
}

/** Persistence for a keyed collection (e.g., busses, specifications). */
export interface ICollectionPersistence<T> {
  readAll(): T[]
  writeItem(key: string, item: T): void
  deleteItem(key: string): void
}
