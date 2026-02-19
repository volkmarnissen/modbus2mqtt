import '@angular/compiler'
import 'zone.js'
import 'zone.js/testing'
import { getTestBed } from '@angular/core/testing'
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing'

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting())
} catch {
  // already initialized
}

export function ensureAngularTesting(): void {
  try {
    getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting())
  } catch {
    // already initialized
  }
}
