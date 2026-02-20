import { it, expect, describe } from 'vitest'
import { Store } from '../../src/server/persistence/store.js'

interface TestItem {
  name: string
  value: number
}

describe('Store', () => {
  // Test 1: add + get basic functionality
  it('add and get: stores and retrieves items', () => {
    const store = new Store<TestItem>()
    store.add('a', { name: 'alpha', value: 1 })
    store.add('b', { name: 'beta', value: 2 })

    const a = store.get('a')
    expect(a).toEqual({ name: 'alpha', value: 1 })
    const b = store.get('b')
    expect(b).toEqual({ name: 'beta', value: 2 })
    expect(store.get('nonexistent')).toBeUndefined()
  })

  // Test 2: get returns a clone, not the original reference
  it('get: returns structuredClone (mutation-safe)', () => {
    const store = new Store<TestItem>()
    store.add('a', { name: 'alpha', value: 1 })

    const retrieved = store.get('a')!
    retrieved.name = 'MUTATED'

    // Original in store should be unchanged
    expect(store.get('a')!.name).toBe('alpha')
  })

  // Test 3: add clones the input
  it('add: clones input (caller mutation does not affect store)', () => {
    const store = new Store<TestItem>()
    const item = { name: 'alpha', value: 1 }
    store.add('a', item)

    // Mutate the original object
    item.name = 'MUTATED'

    // Store should still have the original value
    expect(store.get('a')!.name).toBe('alpha')
  })

  // Test 4: add throws on duplicate key
  it('add: throws on duplicate key', () => {
    const store = new Store<TestItem>()
    store.add('a', { name: 'alpha', value: 1 })

    expect(() => store.add('a', { name: 'other', value: 2 })).toThrow('already exists')
  })

  // Test 5: update replaces existing item
  it('update: replaces existing item', () => {
    const store = new Store<TestItem>()
    store.add('a', { name: 'alpha', value: 1 })
    store.update('a', { name: 'alpha_v2', value: 10 })

    expect(store.get('a')).toEqual({ name: 'alpha_v2', value: 10 })
  })

  // Test 6: update throws on missing key
  it('update: throws on missing key', () => {
    const store = new Store<TestItem>()

    expect(() => store.update('nonexistent', { name: 'x', value: 0 })).toThrow('not found')
  })

  // Test 7: delete removes item
  it('delete: removes item and returns true', () => {
    const store = new Store<TestItem>()
    store.add('a', { name: 'alpha', value: 1 })

    expect(store.delete('a')).toBe(true)
    expect(store.get('a')).toBeUndefined()
    expect(store.size).toBe(0)
  })

  // Test 8: delete returns false for missing key
  it('delete: returns false for missing key', () => {
    const store = new Store<TestItem>()
    expect(store.delete('nonexistent')).toBe(false)
  })

  // Test 9: list returns all items as clones
  it('list: returns all items as clones', () => {
    const store = new Store<TestItem>()
    store.add('a', { name: 'alpha', value: 1 })
    store.add('b', { name: 'beta', value: 2 })

    const items = store.list()
    expect(items).toHaveLength(2)

    // Mutating list results should not affect store
    items[0].name = 'MUTATED'
    expect(store.list().every((i) => i.name !== 'MUTATED')).toBe(true)
  })

  // Test 10: list with filter
  it('list: filter returns matching items only', () => {
    const store = new Store<TestItem>()
    store.add('a', { name: 'alpha', value: 1 })
    store.add('b', { name: 'beta', value: 2 })
    store.add('c', { name: 'gamma', value: 3 })

    const filtered = store.list((item) => item.value > 1)
    expect(filtered).toHaveLength(2)
    expect(filtered.map((i) => i.name).sort()).toEqual(['beta', 'gamma'])
  })

  // Test 11: getRef returns direct reference (no clone)
  it('getRef: returns direct reference (mutations affect store)', () => {
    const store = new Store<TestItem>()
    store.add('a', { name: 'alpha', value: 1 })

    const ref = store.getRef('a')!
    ref.name = 'MUTATED_VIA_REF'

    // Store should see the mutation
    expect(store.get('a')!.name).toBe('MUTATED_VIA_REF')
  })

  // Test 12: listRefs returns direct references
  it('listRefs: returns direct references', () => {
    const store = new Store<TestItem>()
    store.add('a', { name: 'alpha', value: 1 })

    const refs = store.listRefs()
    refs[0].name = 'MUTATED'
    expect(store.get('a')!.name).toBe('MUTATED')
  })

  // Test 13: has / keys / size / clear
  it('has, keys, size, clear: utility methods work correctly', () => {
    const store = new Store<TestItem>()
    store.add('a', { name: 'alpha', value: 1 })
    store.add('b', { name: 'beta', value: 2 })

    expect(store.has('a')).toBe(true)
    expect(store.has('nonexistent')).toBe(false)
    expect(store.keys().sort()).toEqual(['a', 'b'])
    expect(store.size).toBe(2)

    store.clear()
    expect(store.size).toBe(0)
    expect(store.has('a')).toBe(false)
  })
})
