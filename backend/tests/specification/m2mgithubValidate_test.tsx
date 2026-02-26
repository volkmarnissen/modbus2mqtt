import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockExecFile } = vi.hoisted(() => {
  return { mockExecFile: vi.fn() }
})

vi.mock('child_process', () => {
  const fn: any = vi.fn()
  fn[Symbol.for('nodejs.util.promisify.custom')] = mockExecFile
  return { execFile: fn }
})

import { M2mGithubValidate } from '../../src/specification/m2mGithubValidate.js'

describe('M2mGithubValidate', () => {
  let gh: M2mGithubValidate

  beforeEach(() => {
    gh = new M2mGithubValidate()
    vi.clearAllMocks()
  })

  describe('listPullRequestFiles', () => {
    it('returns filtered file list from PR', async () => {
      const files = ['specifications/test-spec.json', 'README.md']
      mockExecFile.mockResolvedValue({ stdout: JSON.stringify(files), stderr: '' })

      const result = await gh.listPullRequestFiles('owner', 42)

      expect(result.pr_number).toBe(42)
      expect(result.files).toEqual(files)
      expect(mockExecFile).toHaveBeenCalledWith('gh', expect.arrayContaining(['api']))
    })

    it('propagates errors from gh CLI', async () => {
      mockExecFile.mockRejectedValue(new Error('gh: command failed'))

      await expect(gh.listPullRequestFiles('owner', 42)).rejects.toThrow('gh: command failed')
    })
  })

  describe('closePullRequest', () => {
    it('calls gh pr close', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })

      await gh.closePullRequest(42)

      expect(mockExecFile).toHaveBeenCalledWith(
        'gh',
        ['pr', 'close', '42', '--repo', expect.stringContaining('modbus2mqtt')],
      )
    })

    it('propagates errors', async () => {
      mockExecFile.mockRejectedValue(new Error('not found'))

      await expect(gh.closePullRequest(42)).rejects.toThrow('not found')
    })
  })

  describe('addIssueComment', () => {
    it('calls gh pr comment with body', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })

      await gh.addIssueComment(42, 'Validation passed')

      expect(mockExecFile).toHaveBeenCalledWith(
        'gh',
        ['pr', 'comment', '42', '--repo', expect.stringContaining('modbus2mqtt'), '--body', 'Validation passed'],
      )
    })
  })

  describe('mergePullRequest', () => {
    it('calls gh pr merge with squash', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })

      await gh.mergePullRequest(42)

      expect(mockExecFile).toHaveBeenCalledWith(
        'gh',
        ['pr', 'merge', '42', '--repo', expect.stringContaining('modbus2mqtt'), '--squash'],
      )
    })

    it('passes commit title when provided', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })

      await gh.mergePullRequest(42, 'Add test-spec')

      expect(mockExecFile).toHaveBeenCalledWith(
        'gh',
        [
          'pr',
          'merge',
          '42',
          '--repo',
          expect.stringContaining('modbus2mqtt'),
          '--squash',
          '--subject',
          'Add test-spec',
        ],
      )
    })
  })
})
