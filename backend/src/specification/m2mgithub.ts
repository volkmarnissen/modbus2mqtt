import { Octokit } from '@octokit/rest'
import { LogLevelEnum, Logger } from './log.js'
import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { Subject, first } from 'rxjs'
import * as fs from 'fs'
import { ConfigSpecification } from './configspec.js'

import Debug from 'debug'
const debug = Debug('m2mgithub')
export const githubPublicNames = {
  publicModbus2mqttOwner: 'modbus2mqtt',
  modbus2mqttRepo: 'modbus2mqtt.config',
  modbus2mqttBranch: 'main',
}

const log = new Logger('m2mGithub')
type StepError = { message?: string; status?: number; code?: number; stack?: string; step?: string }
export interface ITreeParam {
  path: string
  mode: '100644'
  type: 'blob'
  sha: string
}
interface IPullRequestStatusInfo {
  merged: boolean
  closed_at: string | null
  html_url: string
}
export class M2mGitHub {
  private ownOwner: string | undefined
  protected octokit: Octokit | null
  private static forking: boolean = false
  private isRunning = false
  private waitFinished: Subject<void> = new Subject<void>()

  private async findOrCreateOwnModbus2MqttRepo(): Promise<void> {
    debug('findOrCreateOwnModbus2MqttRepo')
    if (this.ownOwner && this.octokit) {
      const repos = await this.octokit.repos.listForUser({
        username: this.ownOwner,
        type: 'all',
      })
      const found = repos.data.find((repo) => repo.name == githubPublicNames.modbus2mqttRepo)
      if (found == null && !M2mGitHub.forking) {
        await this.createOwnModbus2MqttRepo()
      } else {
        if (found != null) M2mGitHub.forking = false
      }
    }
  }

  async hasSpecBranch(branch: string): Promise<boolean> {
    if (null == this.octokit) throw new Error('No Github token configured')
    try {
      await this.octokit.git.getRef({
        owner: this.ownOwner!,
        repo: exports.githubPublicNames.modbus2mqttRepo,
        ref: 'heads/' + branch,
      })
      return true
    } catch (e: unknown) {
      if (e instanceof Error) debug('get Branch' + e.message)
      const status = typeof e === 'object' && e && 'status' in e ? (e as { status?: number }).status : undefined
      if (status != undefined && status == 404) return false
      throw e
    }
  }

  async deleteSpecBranch(branch: string): Promise<void> {
    if (null == this.octokit) throw new Error('No Github token configured')
    const hasBranch = await this.hasSpecBranch(branch)
    if (hasBranch) {
      await this.octokit.git.deleteRef({
        owner: this.ownOwner!,
        repo: githubPublicNames.modbus2mqttRepo,
        ref: 'heads/' + branch,
      })
    }
  }

  private async createOwnModbus2MqttRepo(): Promise<void> {
    debug('createOwnModbus2MqttRepo')
    M2mGitHub.forking = true
    try {
      if (githubPublicNames.publicModbus2mqttOwner) {
        await this.octokit!.repos.createFork({
          owner: githubPublicNames.publicModbus2mqttOwner,
          repo: githubPublicNames.modbus2mqttRepo,
          default_branch_only: true,
        })
      }
    } catch (e) {
      M2mGitHub.forking = false
      throw e
    }
  }

  private async checkRepo(): Promise<boolean> {
    if (null == this.octokit) throw new Error('No Github token configured')
    if (!this.ownOwner) return false
    const repos = await this.octokit.repos.listForUser({
      username: this.ownOwner,
      type: 'all',
    })
    const found = repos.data.find((repo) => repo.name == githubPublicNames.modbus2mqttRepo)
    if (!found) return false
    debug('checkRepo: sync fork')
    M2mGitHub.forking = false
    try {
      await this.octokit.request(`POST /repos/${this.ownOwner}/${githubPublicNames.modbus2mqttRepo}/merge-upstream`, {
        branch: githubPublicNames.modbus2mqttBranch,
      })
      return true
    } catch (e: unknown) {
      const se = e as StepError
      const e1 = new Error(se.message ?? '') as Error & { step?: string; status?: number; code?: number }
      e1.step = se.step
      e1.stack = se.stack
      if (se.code === 422)
        // prettier-ignore
        e1.message = (se.message ?? '') + '\n Permission denied for the github token. Please sync Repository in github.com.'
      throw e1
    }
  }

  private waitForOwnModbus2MqttRepo(): Promise<void> {
    if (this.isRunning) {
      // some other process is waiting already.
      // Just wait until it's done
      return new Promise<void>((resolve) => {
        this.waitFinished.pipe(first()).subscribe(() => {
          resolve()
        })
      })
    } else {
      return new Promise<void>((resolve, reject) => {
        if (null == this.octokit) reject(new Error('No Github token configured'))
        else {
          let count = 0

          // Once per second for 30 seconds, then once per minute
          const interval = setInterval(() => {
            debug('inInterval')
            if (!this.isRunning && (count > 30 ? Math.floor(count % 60) == 0 : true)) {
              this.isRunning = true
              this.checkRepo()
                .then((available) => {
                  if (available) {
                    this.isRunning = false
                    this.waitFinished.next()
                    clearInterval(interval)
                    resolve()
                  }
                })
                .catch((e: StepError) => {
                  this.isRunning = false
                  log.log(
                    LogLevelEnum.error,
                    'Validate Repository ' +
                      this.ownOwner +
                      '/' +
                      githubPublicNames.publicModbus2mqttOwner +
                      ' failed. message: ' +
                      (e.message ?? '') +
                      ' Status: ' +
                      (e.status ?? '')
                  )
                  reject(e)
                })
            }
            count++
          }, 1000)
        }
      })
    }
  }

  constructor(
    personalAccessToken: string | null,
    private publicRoot: string
  ) {
    this.octokit = null
    if (personalAccessToken)
      this.octokit = new Octokit({
        auth: personalAccessToken,
      })
  }
  fetchPublicFiles(): void {
    debug('Fetch public files')
    // If directory exists and is a git repo, pull. If it exists but isn't a repo, skip cloning.
    if (existsSync(this.publicRoot)) {
      if (existsSync(join(this.publicRoot, '.git'))) {
        try {
          const msg = execSync('git pull', { cwd: this.publicRoot }).toString()
          if (msg.split(/\r\n|\r|\n/).length > 2) log.log(LogLevelEnum.info, msg)
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          log.log(LogLevelEnum.warn, 'git pull failed: ' + msg)
        }
      } else {
        log.log(LogLevelEnum.info, 'Public files directory exists, skipping git clone')
      }
    } else {
      log.log(
        LogLevelEnum.info,
        execSync(
          'git clone https://github.com/' +
            githubPublicNames.publicModbus2mqttOwner +
            '/' +
            githubPublicNames.modbus2mqttRepo +
            '.git ' +
            this.publicRoot
        ).toString()
      )
    }
    new ConfigSpecification().readYaml()
  }
  static getPullRequestUrl(pullNumber: number): string {
    return `https://github.com/${githubPublicNames.publicModbus2mqttOwner}/${githubPublicNames.modbus2mqttRepo}/pull/${pullNumber}`
  }

  async createPullrequest(title: string, content: string, branchName: string): Promise<number> {
    if (null == this.octokit) throw new Error('No Github token configured')
    let res
    try {
      res = await this.octokit.rest.issues.create({
        owner: githubPublicNames.publicModbus2mqttOwner,
        repo: githubPublicNames.modbus2mqttRepo,
        title: title,
        body: content,
        labels: ['automerge'],
      })
    } catch (e: unknown) {
      ;(e as StepError).step = 'create issue'
      throw e
    }
    try {
      const pullRes = await this.octokit.rest.pulls.create({
        owner: githubPublicNames.publicModbus2mqttOwner,
        body: content + '\nCloses #' + res.data.number,
        repo: githubPublicNames.modbus2mqttRepo,
        issue: res.data.number,
        head: this.ownOwner + ':' + branchName,
        base: githubPublicNames.modbus2mqttBranch,
      })
      return pullRes.data.number
    } catch (e: unknown) {
      ;(e as StepError).step = 'create pull'
      throw e
    }
  }

  async getPullRequest(pullNumber: number): Promise<IPullRequestStatusInfo> {
    if (null == this.octokit) throw new Error('No Github token configured')
    try {
      const pull = await this.octokit.pulls.get({
        owner: githubPublicNames.publicModbus2mqttOwner,
        repo: githubPublicNames.modbus2mqttRepo,
        pull_number: pullNumber,
      })
      return pull.data
    } catch (e: unknown) {
      if ((e as StepError).step == undefined) (e as StepError).step = 'downloadFile'
      debug(JSON.stringify(e))
      throw e
    }
  }
  getInfoFromError(e: unknown) {
    const err = e as StepError
    let msg = JSON.stringify(e)
    if (err.message) msg = 'ERROR: ' + err.message
    if (err.status) msg += ' status: ' + err.status
    if (err.message) msg += ' message: ' + err.message
    if (err.step) msg += ' in ' + err.step
    return msg
  }

  private async uploadFileAndCreateTreeParameter(root: string, filename: string): Promise<ITreeParam> {
    debug('uploadFileAndCreateTreeParameter')
    const encoding: BufferEncoding = filename.endsWith('.yaml') ? 'utf8' : 'base64'
    const params = {
      owner: this.ownOwner!,
      repo: githubPublicNames.modbus2mqttRepo,
      encoding: encoding == 'utf8' ? 'utf-8' : encoding,
      content: fs.readFileSync(join(root, filename)).toString(encoding),
    }
    if (null == this.octokit) throw new Error('No Github token configured')
    try {
      const res = await this.octokit.git.createBlob(params)
      return {
        path: filename,
        mode: '100644',
        type: 'blob',
        sha: res.data.sha,
      }
    } catch (e: unknown) {
      ;(e as StepError).step = 'createBlob'
      throw e
    }
  }

  async init(): Promise<boolean> {
    // checks if fork from public repository is available
    // Otherwise it creates it, but doesn't wait for creation
    // fetches all files from public repo (Works also if no personal repo is available yet)
    debug('init')
    this.fetchPublicFiles()
    if (null == this.octokit) return false
    if (!this.ownOwner) {
      try {
        const user = await this.octokit.users.getAuthenticated()
        this.ownOwner = user.data.login
      } catch (e: unknown) {
        log.log(LogLevelEnum.error, 'GitHub authentication failed: ' + (e instanceof Error ? e.message : String(e)))
        return false
      }
    }
    try {
      await this.findOrCreateOwnModbus2MqttRepo()
      return true
    } catch (e: unknown) {
      this.ownOwner = undefined
      throw e
    }
  }

  async deleteRepository(): Promise<void> {
    if (null == this.octokit) throw new Error('No Github token configured')
    if (this.ownOwner) {
      await this.octokit.repos.delete({
        owner: this.ownOwner,
        repo: githubPublicNames.modbus2mqttRepo,
      })
    }
  }

  private checkFiles(root: string, files: string[]): Promise<ITreeParam>[] {
    const all: Promise<ITreeParam>[] = []
    files.forEach((file) => {
      debug('root: ' + root + ' file: ' + file)
      const fullPath = join(root, file)
      if (!fs.existsSync(fullPath)) {
        if (fullPath.indexOf('/files/') != -1 && !fullPath.endsWith('files.yaml')) {
          // Can be ignored if the files are missing, they have been published already
          debug('File not found: ' + fullPath)
        } else {
          throw new Error('File not found ' + fullPath)
        }
      } else all.push(this.uploadFileAndCreateTreeParameter(root, file))
    })
    return all
  }

  async commitFiles(root: string, branchName: string, files: string[], title: string, message: string): Promise<string> {
    try {
      await this.waitForOwnModbus2MqttRepo()
    } catch (e: unknown) {
      ;(e as StepError).step = 'waitForOwnModbus2MqttRepo'
      throw e
    }

    let hasBranch: boolean
    try {
      hasBranch = await this.hasSpecBranch(branchName)
    } catch (e: unknown) {
      ;(e as StepError).step = 'hasSpecBranch'
      throw e
    }

    if (hasBranch) {
      throw new Error(
        'There is already a branch named ' +
          branchName +
          ' Please delete it in your github repository ' +
          this.ownOwner +
          '/' +
          githubPublicNames.modbus2mqttRepo +
          ' at github.com'
      )
    }

    debug('start committing')
    let trees: ITreeParam[]
    try {
      const all = this.checkFiles(root, files)
      trees = await Promise.all(all)
    } catch (e: unknown) {
      ;(e as StepError).step = 'create blobs'
      throw e
    }

    let ref
    try {
      debug('get Branch')
      ref = await this.octokit!.git.getRef({
        owner: this.ownOwner!,
        repo: githubPublicNames.modbus2mqttRepo,
        ref: 'heads/' + githubPublicNames.modbus2mqttBranch,
      })
    } catch (e: unknown) {
      ;(e as StepError).step = 'get branch'
      throw e
    }

    let branch
    try {
      branch = await this.octokit!.git.createRef({
        owner: this.ownOwner!,
        repo: githubPublicNames.modbus2mqttRepo,
        ref: 'refs/heads/' + branchName,
        sha: ref.data.object.sha,
      })
    } catch (e: unknown) {
      ;(e as StepError).step = 'create branch'
      throw e
    }

    let tree
    try {
      tree = await this.octokit!.request(
        `GET /repos/${this.ownOwner}/${githubPublicNames.modbus2mqttRepo}/git/trees/${githubPublicNames.modbus2mqttBranch}`
      )
    } catch (e: unknown) {
      ;(e as StepError).step = 'get base tree'
      throw e
    }

    let treeResult
    try {
      debug('createTree')
      treeResult = await this.octokit!.git.createTree({
        owner: this.ownOwner!,
        repo: githubPublicNames.modbus2mqttRepo,
        tree: trees,
        base_tree: tree.data.sha,
      })
    } catch (e: unknown) {
      ;(e as StepError).step = 'create Tree'
      throw e
    }

    let commitResult
    try {
      debug('createCommit')
      commitResult = await this.octokit!.git.createCommit({
        owner: this.ownOwner!,
        repo: githubPublicNames.modbus2mqttRepo,
        message: title + '\n' + message,
        tree: treeResult.data.sha,
        parents: [branch.data.object.sha],
      })
    } catch (e: unknown) {
      ;(e as StepError).step = 'createCommit'
      throw e
    }

    try {
      debug('updateRef')
      await this.octokit!.git.updateRef({
        owner: this.ownOwner!,
        repo: githubPublicNames.modbus2mqttRepo,
        ref: 'heads/' + branchName,
        sha: commitResult.data.sha,
      })
    } catch (e: unknown) {
      ;(e as StepError).step = 'updateRef'
      throw e
    }

    debug('updated')
    return commitResult.data.sha
    // commits the given files with message to own repository
    // creates an issue in the public repository
    // creates a pull request to the public repository
    // If there is already a pull request, the new request will be appended
  }
}
