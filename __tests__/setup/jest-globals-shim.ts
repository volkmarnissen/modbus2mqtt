import { vi, it, test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'

export { expect, describe, beforeAll, afterAll, beforeEach, afterEach, it, test }
export const jest = vi
export const xit = it.skip
export const xtest = test.skip
