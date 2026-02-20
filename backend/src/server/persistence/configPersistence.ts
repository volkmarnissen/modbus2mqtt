import { parse, stringify } from 'yaml'
import * as fs from 'fs'
import * as path from 'path'
import { join } from 'path'
import Debug from 'debug'
import { Iconfiguration } from '../../shared/server/index.js'
import { ISingletonPersistence } from './persistence.js'

const debug = Debug('configPersistence')
const secretsLength = 256

export class ConfigPersistence implements ISingletonPersistence<Iconfiguration> {
  constructor(
    private configDir: string,
    private localDir: string
  ) {}

  async read(): Promise<Iconfiguration | undefined> {
    if (!this.configDir || this.configDir.length === 0) {
      return undefined
    }
    if (!fs.existsSync(this.configDir)) {
      return undefined
    }

    const yamlFile = this.getConfigPath()
    if (!fs.existsSync(yamlFile)) {
      return undefined
    }

    const secretsFile = join(this.localDir, 'secrets.yaml')
    let src: string = fs.readFileSync(yamlFile, { encoding: 'utf8' })
    if (fs.existsSync(secretsFile)) {
      const secrets = parse(fs.readFileSync(secretsFile, { encoding: 'utf8' }))
      const srcLines = src.split('\n')
      src = ''
      srcLines.forEach((line) => {
        const r1 = /"*!secret ([a-zA-Z0-9-_]*)"*/g
        const matches = line.matchAll(r1)
        let skipLine = false
        for (const match of matches) {
          const key = match[1]
          if (secrets[key] && secrets[key].length) {
            line = line.replace(match[0], '"' + secrets[key] + '"')
          } else {
            skipLine = true
            if (!secrets[key]) debug('no entry in secrets file for ' + key + ' line will be ignored')
            else debug('secrets file entry contains !secret for ' + key + ' line will be ignored')
          }
        }
        if (!skipLine) src = src.concat(line, '\n')
      })
    }

    return parse(src) as Iconfiguration
  }

  write(config: Iconfiguration): void {
    const cpConfig = structuredClone(config)
    const secrets: {
      mqttpassword?: string
      mqttuser?: string
      githubPersonalToken?: string
      username?: string
      password?: string
    } = {}

    if (cpConfig.mqttconnect.password) {
      secrets.mqttpassword = cpConfig.mqttconnect.password as string
      cpConfig.mqttconnect.password = '!secret mqttpassword'
    }
    if (cpConfig.mqttconnect.username) {
      secrets.mqttuser = cpConfig.mqttconnect.username
      cpConfig.mqttconnect.username = '!secret mqttuser'
    }
    if (cpConfig.githubPersonalToken) {
      secrets.githubPersonalToken = cpConfig.githubPersonalToken
      cpConfig.githubPersonalToken = '!secret githubPersonalToken'
    }
    if (cpConfig.username) {
      secrets.username = cpConfig.username
      cpConfig.username = '!secret username'
    }
    if (cpConfig.password) {
      secrets.password = cpConfig.password
      cpConfig.password = '!secret password'
    }

    const nonConfigs: string[] = ['mqttusehassio', 'filelocation', 'appVersion']
    nonConfigs.forEach((name: string) => {
      delete cpConfig[name as keyof Iconfiguration]
    })

    const filename = this.getConfigPath()
    const dir = path.dirname(filename)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    let s = stringify(cpConfig)
    fs.writeFileSync(filename, s, { encoding: 'utf8' })
    s = stringify(secrets)
    fs.writeFileSync(this.getSecretsPath(), s, { encoding: 'utf8' })
  }

  getConfigPath(): string {
    return join(this.localDir, 'modbus2mqtt.yaml')
  }

  getSecretsPath(): string {
    return join(this.localDir, 'secrets.yaml')
  }

  static getSecret(pathStr: string): string {
    let result = ''
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    const charactersLength = characters.length
    let counter = 0
    if (fs.existsSync(pathStr)) {
      const secret = fs.readFileSync(pathStr, { encoding: 'utf8' }).toString()
      if (secret && secret.length > 0) {
        return secret
      }
    }
    debug('getSecret: Create secrets file at' + pathStr)
    while (counter < secretsLength) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength))
      counter += 1
    }
    const dir = path.dirname(pathStr)
    debug('Config.getSecret: write Secretfile to ' + pathStr)
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(pathStr, result, { encoding: 'utf8' })
    debug('Config.getSecret: write successful')

    return result
  }

  resetForE2E(minimalConfig: Record<string, unknown>): void {
    if (!fs.existsSync(this.localDir)) fs.mkdirSync(this.localDir, { recursive: true })
    fs.writeFileSync(this.getConfigPath(), stringify(minimalConfig), { encoding: 'utf8' })

    const secretsPath = this.getSecretsPath()
    if (fs.existsSync(secretsPath)) fs.unlinkSync(secretsPath)
  }
}
