export interface Announcement {
  /** Unique, permanent identifier. Once published, never reuse. */
  id: string
  /** Short headline */
  title: string
  /** HTML content for the body (inline tags only) */
  messageHtml: string
  /** ISO date string */
  date: string
  severity: 'info' | 'warning' | 'breaking'
}

/**
 * Add new announcements at the TOP of this array.
 * Each entry needs a unique `id` that never changes once published.
 */
export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'tcpbridge-port-2026-01',
    title: 'Breaking Change: tcpBridge → tcpBridgePort',
    messageHtml:
      'The boolean <code>tcpBridge</code> option has been replaced by <code>tcpBridgePort</code> (a port number). ' +
      'Please check your bus configuration and set the port explicitly (e.g. <code>502</code>).',
    date: '2026-01-23',
    severity: 'breaking',
  },
]
