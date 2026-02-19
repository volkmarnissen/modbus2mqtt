import { Injectable } from '@angular/core'
import { ANNOUNCEMENTS, Announcement } from './announcements'

const STORAGE_KEY = 'modbus2mqtt.dismissedAnnouncements'
const SUPPRESS_KEY = 'modbus2mqtt.suppressBanner'

@Injectable({
  providedIn: 'root',
})
export class AnnouncementService {
  getActiveAnnouncements(): Announcement[] {
    if (localStorage.getItem(SUPPRESS_KEY)) {
      return []
    }
    const dismissed = this.getDismissedIds()
    return ANNOUNCEMENTS.filter((a) => !dismissed.has(a.id))
  }

  dismiss(id: string): void {
    const dismissed = this.getDismissedIds()
    dismissed.add(id)
    this.saveDismissedIds(dismissed)
  }

  dismissAll(): void {
    const dismissed = this.getDismissedIds()
    ANNOUNCEMENTS.forEach((a) => dismissed.add(a.id))
    this.saveDismissedIds(dismissed)
  }

  private getDismissedIds(): Set<string> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        return new Set(JSON.parse(raw) as string[])
      }
    } catch {
      // corrupted data -- treat as empty
    }
    return new Set()
  }

  private saveDismissedIds(ids: Set<string>): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  }
}
