/**
 * Generic in-memory store for keyed collections.
 * Provides clone-on-read/write by default to prevent accidental mutation.
 */
export class Store<T> {
  private items = new Map<string, T>()

  get(key: string): T | undefined {
    const item = this.items.get(key)
    return item !== undefined ? structuredClone(item) : undefined
  }

  add(key: string, item: T): void {
    if (this.items.has(key)) {
      throw new Error(`Store: key "${key}" already exists`)
    }
    this.items.set(key, structuredClone(item))
  }

  update(key: string, item: T): void {
    if (!this.items.has(key)) {
      throw new Error(`Store: key "${key}" not found`)
    }
    this.items.set(key, structuredClone(item))
  }

  delete(key: string): boolean {
    return this.items.delete(key)
  }

  list(filter?: (item: T) => boolean): T[] {
    const all = Array.from(this.items.values())
    const filtered = filter ? all.filter(filter) : all
    return filtered.map((item) => structuredClone(item))
  }

  /** Direct reference — no clone. For internal/performance-critical use only. */
  getRef(key: string): T | undefined {
    return this.items.get(key)
  }

  /** Direct references — no clone. For internal/performance-critical use only. */
  listRefs(filter?: (item: T) => boolean): T[] {
    const all = Array.from(this.items.values())
    return filter ? all.filter(filter) : all
  }

  has(key: string): boolean {
    return this.items.has(key)
  }

  clear(): void {
    this.items.clear()
  }

  keys(): string[] {
    return Array.from(this.items.keys())
  }

  get size(): number {
    return this.items.size
  }
}
