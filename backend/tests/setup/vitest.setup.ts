import { vi, expect, it, test } from 'vitest'

// Provide a Jest-compatible global for tests that reference `jest`
// (Vitest uses `vi` instead.)
;(globalThis as any).jest = vi

// Ensure `expect` is available globally if not using globals
;(globalThis as any).expect = expect

// Provide Jest helpers aliases used in suite
;(globalThis as any).xit = it.skip
;(globalThis as any).xtest = test.skip
