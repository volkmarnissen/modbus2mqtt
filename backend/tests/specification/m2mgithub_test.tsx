import Debug from 'debug'
import { M2mGitHub } from '../../src/specification/index.js'
import { configDir, dataDir } from './configsbase.js'
import { join } from 'path'
import { ConfigSpecification } from '../../src/specification/index.js'
import { beforeAll, expect, it, describe, jest } from '@jest/globals'
import * as fs from 'fs'

const debug = Debug('m2mgithub')

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      GITHUB_TOKEN: string
    }
  }
}

Debug.enable('m2mgithub')
ConfigSpecification['configDir'] = configDir
ConfigSpecification['dataDir'] = dataDir
ConfigSpecification.setMqttdiscoverylanguage('en', process.env.GITHUB_TOKEN)
beforeAll(() => {
  ConfigSpecification['configDir'] = configDir
  new ConfigSpecification().readYaml()
  M2mGitHub.prototype['createOwnModbus2MqttRepo']
})
async function testWait(github: M2mGitHub): Promise<void> {
  const hasGhToken = await github.init()
  expect(hasGhToken).toBeTruthy()
  const title = 'Test'
  const content = 'Some Text'
  await github.deleteSpecBranch('waterleveltransmitter')
  await github.commitFiles(
    ConfigSpecification.getPublicDir(),
    'waterleveltransmitter',
    [
      'specifications/waterleveltransmitter.yaml',
      'specifications/files/waterleveltransmitter/files.yaml',
      'specifications/files/waterleveltransmitter/IMG_1198.jpg',
    ],
    title,
    content
  )
  debug('Commit created successfully')
  await github.createPullrequest(title, content, 'waterleveltransmitter')
}
it('checkFiles existing file OK, missing file skipped', () => {
  const localRoot = ConfigSpecification.getLocalDir()
  const github = new M2mGitHub(null, localRoot)
  const oldFn = M2mGitHub.prototype['uploadFileAndCreateTreeParameter']
  M2mGitHub.prototype['uploadFileAndCreateTreeParameter'] = jest
    .fn<(root: string, filemname: string) => Promise<any>>()
    .mockResolvedValue({})
  const a = github['checkFiles'](localRoot, [
    '/specifications/waterleveltransmitter.json',
    '/specifications/files/waterleveltransmitter/test.png',
  ])
  expect(a.length).toBe(1)
  M2mGitHub.prototype['uploadFileAndCreateTreeParameter'] = oldFn
})

it('checkFiles files.yaml does not exist => Exception', () => {
  const localRoot = ConfigSpecification.getLocalDir()
  const github = new M2mGitHub(null, localRoot)
  const oldFn = M2mGitHub.prototype['uploadFileAndCreateTreeParameter']
  M2mGitHub.prototype['uploadFileAndCreateTreeParameter'] = jest
    .fn<(root: string, filemname: string) => Promise<any>>()
    .mockResolvedValue({})
  const t: () => void = () => {
    github['checkFiles'](localRoot, [
      '/specifications/files/notexists/files.yaml',
      '/specifications/files/waterleveltransmitter/test.png',
    ])
  }
  expect(t).toThrow()
  M2mGitHub.prototype['uploadFileAndCreateTreeParameter'] = oldFn
})

describe.skip('skipped because github tests require NODE_AUTH_TOKEN', () => {
  it('init with no github token', async () => {
    const publictestdir = join(ConfigSpecification.dataDir, 'publictest')
    const github = new M2mGitHub(null, publictestdir)
    github['ownOwner'] = 'modbus2mqtt'
    const hasGhToken = await github.init()
    expect(hasGhToken).toBeFalsy()
    fs.rmSync(publictestdir, { recursive: true })
  })

  it('init', async () => {
    const github = new M2mGitHub(process.env.GITHUB_TOKEN, join(configDir, 'publictest'))
    github['ownOwner'] = 'modbus2mqtt'
    await testWait(github)
    // github.deleteRepository().then(() => {
    //     testWait(github, done)
    // }).catch(e => {
    //     testWait(github, done)
    // })
  }, 10000)
})
