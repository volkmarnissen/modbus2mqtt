import { describe, it, expect } from 'vitest'
import { TestBed } from '@angular/core/testing'
import { Component } from '@angular/core'
import { ensureAngularTesting } from './test-setup'

ensureAngularTesting()

@Component({
  selector: 'app-smoke',
  standalone: true,
  template: '<p>smoke test works</p>',
})
class SmokeComponent {}

describe('Smoke test (vitest + TestBed)', () => {
  it('should create a component via TestBed', async () => {
    await TestBed.configureTestingModule({
      imports: [SmokeComponent],
    }).compileComponents()

    const fixture = TestBed.createComponent(SmokeComponent)
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('smoke test works')
  })
})
