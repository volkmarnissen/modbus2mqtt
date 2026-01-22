import { vi, it, test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'

export { expect, describe, beforeAll, afterAll, beforeEach, afterEach, it, test }
export const jest = vi
export const xit: any = it.skip
export const xtest: any = test.skip
