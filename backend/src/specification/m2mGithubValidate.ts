import { githubPublicNames } from './m2mgithub.js'
import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'

const execFile = promisify(execFileCb)

export interface IpullRequest {
  files?: string[]
  merged: boolean
  closed: boolean
  pullNumber: number
}

export class M2mGithubValidate {
  private repo: string

  constructor() {
    this.repo = `${githubPublicNames.publicModbus2mqttOwner}/${githubPublicNames.modbus2mqttRepo}`
  }

  async listPullRequestFiles(_owner: string, pull_number: number): Promise<{ pr_number: number; files: string[] }> {
    const { stdout } = await execFile('gh', [
      'api',
      `repos/${this.repo}/pulls/${pull_number}/files`,
      '--jq',
      '[.[] | select(.status == "added" or .status == "modified" or .status == "renamed" or .status == "copied" or .status == "changed") | .filename]',
    ])
    const files: string[] = JSON.parse(stdout)
    return { pr_number: pull_number, files }
  }

  async closePullRequest(pullNumber: number): Promise<void> {
    await execFile('gh', ['pr', 'close', String(pullNumber), '--repo', this.repo])
  }

  async addIssueComment(pullNumber: number, text: string): Promise<void> {
    await execFile('gh', ['pr', 'comment', String(pullNumber), '--repo', this.repo, '--body', text])
  }

  async mergePullRequest(pullNumber: number, title?: string): Promise<void> {
    const args = ['pr', 'merge', String(pullNumber), '--repo', this.repo, '--squash']
    if (title) args.push('--subject', title)
    await execFile('gh', args)
  }
}
