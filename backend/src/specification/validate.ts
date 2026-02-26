#!/usr/bin/env node
import { Imessage, SPECIFICATION_VERSION } from '../shared/specification/index.js'
import { IfileSpecification } from './ifilespecification.js'
import { LogLevelEnum, Logger } from './log.js'
import { Command } from 'commander'
import * as fs from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'
import { M2mGithubValidate } from './m2mGithubValidate.js'
import { M2mSpecification } from './m2mspecification.js'
import { githubPublicNames } from './m2mgithub.js'

const execFile = promisify(execFileCb)

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
cli.usage('[--pr_number <pull request number>]')
cli.option('-p, --pr_number <number>', 'pr_number of commit which triggered the pull request')
cli.option('-o, --pr_owner <owner>', 'Creator of the pull request')
const rawArgs = process.argv.slice(2)
if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  cli.outputHelp()
  process.exit(0)
}
cli.parse(process.argv)
let pr_number: number | undefined
let pr_owner: string | undefined
const options = cli.opts()

if (options['pr_number']) {
  pr_number = Number.parseInt(options['pr_number'])
}
if (options['pr_owner']) {
  pr_owner = options['pr_owner']
}
const log = new Logger('validate')

function logAndExit(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e)
  log.log(LogLevelEnum.error, msg)
  process.exit(5)
}

async function validate() {
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
  const gh = new M2mGithubValidate()

  const data = await gh.listPullRequestFiles(pr_owner, pr_number)
  const repo = `${githubPublicNames.publicModbus2mqttOwner}/${githubPublicNames.modbus2mqttRepo}`

  // Determine which files are spec JSON files
  let specsOnly = true
  const specFiles: string[] = []
  for (const fname of data.files) {
    if (!fname.startsWith('specifications/')) {
      specsOnly = false
    } else if (fname.startsWith('specifications/') && fname.endsWith('.json') && !fname.startsWith('specifications/files/')) {
      specFiles.push(fname)
    }
  }

  if (specsOnly && process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, 'SPECS_ONLY=true\n')
  }

  if (specFiles.length === 0) {
    log.log(LogLevelEnum.info, 'No specification JSON files found in PR')
    process.exit(0)
  }

  // Clone the repo and checkout the PR branch to read spec files
  const tmpDir = fs.mkdtempSync(join(tmpdir(), 'm2m-validate-'))
  try {
    await execFile('git', [
      'clone',
      '--depth',
      '1',
      `https://github.com/${repo}.git`,
      tmpDir,
    ])
    await execFile('gh', ['pr', 'checkout', String(pr_number), '--repo', repo, '--detach'], { cwd: tmpDir })

    const messages: Imessage[] = []
    const specnames: string[] = []

    for (const fname of specFiles) {
      const filePath = join(tmpDir, fname)
      if (!fs.existsSync(filePath)) continue

      const content = fs.readFileSync(filePath, 'utf-8')
      const spec: IfileSpecification = JSON.parse(content)
      spec.filename = fname.replace('specifications/', '').replace('.json', '')
      specnames.push(spec.filename)

      const m2mSpec = new M2mSpecification(spec)
      const specMessages = m2mSpec.validate('en')
      messages.push(...specMessages)
    }

    const specnamesStr = specnames.join(', ')

    if (specnames.length > 0) {
      if (messages.length === 0) {
        log.log(LogLevelEnum.info, 'specifications ' + specnamesStr + ' are valid')
        await gh.addIssueComment(
          pr_number,
          `**$\${\\color{green}\\space ${specnamesStr}\\space validated\\space successfully}$$**\nSpecifications '${specnamesStr}' have no issues`
        )
        log.log(LogLevelEnum.info, 'Issue Comment added')
        process.exit(0)
      } else {
        const errors = specnames
          .map((name) => {
            const spec: IfileSpecification = JSON.parse(
              fs.readFileSync(join(tmpDir, 'specifications', name + '.json'), 'utf-8')
            )
            return M2mSpecification.messages2Text(spec, messages)
          })
          .join('\n')
        log.log(LogLevelEnum.error, 'not all specifications of ' + specnamesStr + ' are valid. Proceed manually')
        await gh.addIssueComment(
          pr_number,
          `**$\${\\color{red}Proceed\\space manually}$$**\nSpecification '${specnamesStr}' are not valid.\n${errors}`
        )
        process.exit(5)
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

validate().catch(logAndExit)
