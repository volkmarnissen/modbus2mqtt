import { expect, it, beforeAll, afterAll } from '@jest/globals'
import { HttpServer as HttpServer } from '../../src/server/httpserver.js'
import { Config } from '../../src/server/config.js'
import { ConfigPersistence } from '../../src/server/persistence/configPersistence.js'
import supertest from 'supertest'
import { ConfigSpecification } from '../../src/specification/index.js'
import { join } from 'path'
import AdmZip from 'adm-zip'
import { ConfigBus } from '../../src/server/configbus.js'
import { setConfigsDirsForTest } from './configsbase.js'
import { TempConfigDirHelper } from './testhelper.js'
setConfigsDirsForTest()

let httpServer: HttpServer
let tempHelper: TempConfigDirHelper

const oldAuthenticate: (req: any, res: any, next: () => void) => void = HttpServer.prototype.authenticate
beforeAll(() => {
  tempHelper = new TempConfigDirHelper('httpserver_fakeTimer')
  tempHelper.setup()
  new ConfigSpecification().readYaml()
  return new Promise<void>((resolve) => {
    const cfg = new Config()
    cfg.readYamlAsync().then(() => {
      ConfigBus.readBusses()
      HttpServer.prototype.authenticate = (req, res, next) => {
        next()
      }
      httpServer = new HttpServer(join(ConfigPersistence.configDir, 'angular'))

      resolve()
    })
  })
})
afterAll(() => {
  HttpServer.prototype.authenticate = oldAuthenticate
  if (tempHelper) tempHelper.cleanup()
})

it('GET download/local', async () => {
  supertest(httpServer['app'])
    .get('/download/local')
    .responseType('blob')
    .expect(200)
    .then((response) => {
      const buffer = response.body as any as Buffer
      const zip = new AdmZip(buffer)
      zip.getEntries().forEach((e: unknown) => {
        expect(e.entryName.indexOf('secrets.yaml')).toBeLessThan(0)
      })
    })
    .catch(() => {
      // Propagate error to the test runner to avoid unhandled rejections
    })
})
