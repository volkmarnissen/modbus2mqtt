import { IbaseSpecification, Imessage, SPECIFICATION_VERSION } from '../shared/specification/index.js'
import { LogLevelEnum, Logger } from './log.js'
import { Command } from 'commander'
import { ConfigSpecification } from './configspec.js'
import * as fs from 'fs'
import { M2mGithubValidate } from './m2mGithubValidate.js'
import { M2mSpecification } from './m2mspecification.js'
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      GITHUB_TOKEN: string
      PR_NUMBER: string
      GITHUB_OUTPUT: string
    }
  }
}

const cli = new Command()
cli.version(SPECIFICATION_VERSION)
cli.usage('--config <config-dir> --data <data-dir> [--pr_number <pull request number>]')
cli.option('-c, --config <config-dir>', 'set directory for add on configuration')
cli.option('-d, --data <data-dir>', 'set directory for persistent data (public specifications)')

cli.option('-p, --pr_number <number>', 'pr_number of commit which triggered the pull request')
cli.option('-o, --pr_owner <owner>', 'Creator of the pull request')
cli.parse(process.argv)
let pr_number: number | undefined
let pr_owner: string | undefined
const options = cli.opts()
if (options['config']) {
  ConfigSpecification.configDir = options['config']
} else {
  ConfigSpecification.configDir = '.'
}
if (options['data']) {
  ConfigSpecification.dataDir = options['data']
} else {
  ConfigSpecification.dataDir = '.'
}

if (options['pr_number']) {
  pr_number = Number.parseInt(options['pr_number'])
}
if (options['pr_owner']) {
  pr_owner = options['pr_owner']
}
const log = new Logger('validate')

function logAndExit(e: unknown) {
  let step = ''
  const err = e as { step?: string; message?: string }
  if (err.step) step = err.step
  const msg = err.message ?? String(e)
  log.log(LogLevelEnum.error, step + ' ' + msg)
  process.exit(5)
}

function validate() {
  if (!fs.existsSync(ConfigSpecification.configDir)) fs.mkdirSync(ConfigSpecification.configDir, { recursive: true })
  if (!fs.existsSync(ConfigSpecification.dataDir)) fs.mkdirSync(ConfigSpecification.dataDir, { recursive: true })

  if (pr_number == undefined) {
    log.log(LogLevelEnum.error, 'No Pull Request number passed in command line')
    process.exit(2)
  }
  if (pr_owner == undefined) {
    log.log(LogLevelEnum.error, 'No Pull Creator passed in command line')
    process.exit(2)
  }
  if (!process.env.GITHUB_TOKEN) {
    log.log(LogLevelEnum.error, 'No Github Access Token passed to environment variable GITHUB_TOKEN')
    process.exit(2)
  }
  log.log(LogLevelEnum.info, 'pull request: ' + pr_number)
  const gh = new M2mGithubValidate(process.env.GITHUB_TOKEN)
  gh.listPullRequestFiles(pr_owner, pr_number)
    .then((data) => {
      const pr_number = data.pr_number
      const s = new ConfigSpecification()
      s.readYaml()
      const messages: Imessage[] = []
      let specnames: string = ''
      let lastSpec: IbaseSpecification | undefined
      let specsOnly = true
      data.files.forEach((fname) => {
        if (!fname.startsWith('specifications/')) {
          specsOnly = false
        } else if (!fname.startsWith('specifications/files/')) {
          const specname = fname.substring('specifications/'.length)
          specnames = specnames + ', ' + specname
          const fs = ConfigSpecification.getSpecificationByFilename(specname)
          if (fs) {
            const m2mSpec = new M2mSpecification(fs)
            lastSpec = fs
            messages.concat(m2mSpec.validate('en'))
          }
        }
      })
      if (specsOnly) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'SPECS_ONLY=true\n')
      if (specsOnly && specnames.length > 0) {
        specnames = specnames.substring(2)
        if (messages.length == 0) {
          log.log(LogLevelEnum.info, 'specifications ' + specnames + ' are valid')
          gh.addIssueComment(
            pr_number!,
            "**$${\\color{green}\\space ' + specnames + '\\space validated\\space successfully}$$**\nSpecifications '" +
              specnames +
              "' have no issues"
          )
            .then(() => {
              log.log(LogLevelEnum.info, 'Issue Comment added')
              process.exit(0)
            })
            .catch((e) => {
              logAndExit(e)
            })
        } else if (lastSpec) {
          const errors = M2mSpecification.messages2Text(lastSpec, messages)
          log.log(
            LogLevelEnum.error,
            'not all specifications of \\space ' + specnames + '\\space are valid\\space Proceed manually'
          )
          gh.addIssueComment(
            pr_number!,
            "**$${\\color{red}Proceed\\space manually}$$**\nSpecification '" + specnames + "'\\space are not valid.\n" + errors
          )
            .then((e) => {
              logAndExit(e)
            })
            .catch((e) => {
              logAndExit(e)
            })
        } else {
          logAndExit(new Error('No specification found'))
        }
      }
    })
    .catch((e) => {
      logAndExit(e)
    })
}
validate()
