import Debug from 'debug'
import { ConfigSpecification } from '../../src/specification/index.js'
import { it, expect, beforeAll, afterAll } from '@jest/globals'
import * as fs from 'fs'
import { configDir } from './configsbase.js'

const yamlDir = '__tests__/yamlDirValidate'
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      GITHUB_TOKEN: string
      GITHUB_TOKEN_PARENT: string
    }
  }
}

Debug.enable('m2mgithubvalidate')
ConfigSpecification['configDir'] = configDir
beforeAll(() => {
  fs.rmSync(yamlDir, { recursive: true, force: true })
  fs.mkdirSync(yamlDir)
})
afterAll(() => {
  fs.rmSync(yamlDir, { recursive: true, force: true })
})

it.skip('validate test requires GITHUB_TOKEN', () => {
  expect(process.env.GITHUB_TOKEN).toBeDefined()
}, 10000)
