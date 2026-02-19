import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AnnouncementService } from './announcement.service'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

describe('AnnouncementService', () => {
  let service: AnnouncementService

  beforeEach(() => {
    localStorageMock.clear()
    service = new AnnouncementService()
  })

  it('returns all announcements when none dismissed', () => {
    const active = service.getActiveAnnouncements()
    expect(active.length).toBeGreaterThan(0)
  })

  it('does not return dismissed announcements', () => {
    const all = service.getActiveAnnouncements()
    const firstId = all[0].id
    service.dismiss(firstId)
    const remaining = service.getActiveAnnouncements()
    expect(remaining.find((a) => a.id === firstId)).toBeUndefined()
  })

  it('persists dismissals across instances', () => {
    const all = service.getActiveAnnouncements()
    service.dismiss(all[0].id)
    const newService = new AnnouncementService()
    const remaining = newService.getActiveAnnouncements()
    expect(remaining.find((a) => a.id === all[0].id)).toBeUndefined()
  })

  it('dismisses all announcements', () => {
    service.dismissAll()
    expect(service.getActiveAnnouncements().length).toBe(0)
  })
})
