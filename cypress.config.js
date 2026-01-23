const { defineConfig } = require('cypress')
const EventEmitter = require('node:events')

const MqttHelper = require('./cypress/functions/mqtt')
const fs = require('fs')
const os = require('os')
const path = require('path')
const localhost = '127.0.0.1'
var logStartupFlag = false
var logServersFlag = false
function logStartup(msg) {
  if (logStartupFlag) console.log(msg)
}
function logServer(msg) {
  if (logStartupFlag) console.log(msg)
}

module.exports = defineConfig({
  component: {
    devServer: {
      framework: 'angular',
      bundler: 'webpack',
    },
    specPattern: '**/*.cy.ts',
  },
  retries: {
    // Configure retry attempts for `cypress run`
    // Default is 0
    runMode: 2,
    // Configure retry attempts for `cypress open`
    // Default is 0
    openMode: 0,
  },
  e2e: {
    setupNodeEvents(on, config) {
      logStartupFlag = config.env.logstartup
      console.log('Startup Logging is ' + (logStartupFlag ? 'enabled' : 'disabled'))
      logServersFlag = config.env.logservers
      console.log('Server Logging is ' + (logServersFlag ? 'enabled' : 'disabled'))

      // implement node event listeners here
      on('task', {
        mqttConnect(connectionData) {
          return new Promise((resolve, reject) => {
            try {
              // mqtt connect with onConnected = resolve
              let mqttHelper = MqttHelper.getInstance()
              mqttHelper
                .connect(connectionData)
                .then(() => {
                  console.log('mqttConnect connected ')
                  resolve('connected')
                })
                .catch((e) => {
                  console.log('mqttConnect rejected ' + e.message)
                  reject('rejected' + e)
                })
            } catch (e) {
              console.log('mqttConnect exception ' + e.message)
              reject('Exception' + e)
            }
          })
        },
        mqttClose() {
          return new Promise((resolve, reject) => {
            // mqtt connect with onConnected = resolve
            let mqttHelper = MqttHelper.getInstance()
            mqttHelper.close()
            resolve('closed')
          })
        },
        mqttSubscribe(topic) {
          let mqttHelper = MqttHelper.getInstance()
          mqttHelper.subscribe(topic)
          return null
        },
        mqttPublish(topic, payload) {
          let mqttHelper = MqttHelper.getInstance()
          mqttHelper.publish(topic, payload)
          return null
        },
        mqttGetTopicAndPayloads() {
          return new Promise((resolve) => {
            let mqttHelper = MqttHelper.getInstance()
            resolve(mqttHelper.getTopicAndPayloads())
          })
        },
        mqttResetTopicAndPayloads() {
          let mqttHelper = MqttHelper.getInstance()
          mqttHelper.resetTopicAndPayloads()
          return null
        },
        testWait() {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve('OK')
            }, 30000)
          })
        },
        getTempDir(args) {
          return new Promise((resolve, reject) => {
            const tmpfilePath = 'cypress/servers/tmpfiles'
            let data = ''
            try {
              data = fs.readFileSync(tmpfilePath, 'utf-8')
            } catch (e) {
              if (e && e.code !== 'ENOENT') {
                return reject(e)
              }
              // If file is missing, create it and generate a temp dir for this args
              try {
                fs.mkdirSync(path.dirname(tmpfilePath), { recursive: true })
                const gen = fs.mkdtempSync(path.join(os.tmpdir(), 'm2m-cy-'))
                fs.writeFileSync(tmpfilePath, `${args} ${gen}\n`, { flag: 'a' })
                return resolve(gen)
              } catch (e2) {
                return reject(e2)
              }
            }

            if (!data) {
              // File exists but empty — generate and append
              try {
                const gen = fs.mkdtempSync(path.join(os.tmpdir(), 'm2m-cy-'))
                fs.writeFileSync(tmpfilePath, `${args} ${gen}\n`, { flag: 'a' })
                return resolve(gen)
              } catch (e3) {
                return reject(e3)
              }
            }

            const re = new RegExp(args + ' (.*)\n')
            const matches = re.exec(data)
            if (matches && matches.length > 1) return resolve(matches[1])

            // Not found — generate and append then return
            try {
              const gen = fs.mkdtempSync(path.join(os.tmpdir(), 'm2m-cy-'))
              fs.writeFileSync(tmpfilePath, `${args} ${gen}\n`, { flag: 'a' })
              return resolve(gen)
            } catch (e4) {
              return reject(e4)
            }
          })
        },
        log(msg) {
          console.log(msg)
          return 'OK'
        },
      })
    },
  },
  env: {
    logstartup: false, // Set to true to log startup services messages
    logservers: true,
    nginxAddonHttpPort: 3006, //nginx
    modbus2mqttAddonHttpPort: 3004, //ingress port
    modbusTcpHttpPort: 3002,
    modbus2mqttE2eHttpPort: 3005,
    mosquittoAuthMqttPort: 3001,
    mosquittoNoAuthMqttPort: 3003,
    modbus2mqttMqttNoAuthPort: 3007,
    mqttconnect: {
      mqttserverurl: 'mqtt://127.0.0.1:3001',
      username: 'homeassistant',
      password: 'homeassistant',
    },
  }, //env
})
