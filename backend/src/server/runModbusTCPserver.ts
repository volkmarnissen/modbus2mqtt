import { Command } from 'commander'
import { ConfigSpecification, Logger, LogLevelEnum } from '../specification/index.js'

import { Config } from './config.js'
import { ConfigPersistence } from './persistence/configPersistence.js'
import process from 'process'
import { startModbusTCPserver } from './modbusTCPserver.js'
const log = new Logger('modbusTCPserver')

const cli = new Command()
cli.usage('--config <config-dir> --data <data-dir> --busid <buis id number>')
cli.option('-c, --config <config-dir>', 'set directory for add on configuration')
cli.option('-d, --data <data-dir>', 'set directory for persistent data (public specifications)')
cli.option('-b, --busid <bus id>', 'starts Modbus TCP server for the given yaml-dir and bus')
cli.parse(process.argv)
const options = cli.opts()
if (options['config']) {
  ConfigPersistence.configDir = options['config']
  ConfigSpecification.configDir = options['config']
} else {
  ConfigPersistence.configDir = '.'
  ConfigSpecification.configDir = '.'
}
if (options['data']) {
  ConfigPersistence.dataDir = options['data']
  ConfigSpecification.dataDir = options['data']
} else {
  ConfigPersistence.dataDir = '.'
  ConfigSpecification.dataDir = '.'
}
if (options['busid']) {
  startModbusTCPserver(ConfigSpecification.configDir, ConfigSpecification.dataDir, parseInt(options['busid']))
} else log.log(LogLevelEnum.error, 'Unable to start Modbus TCP server invalid argument: ' + options['busid'])
