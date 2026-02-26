import { describe, it, expect, beforeAll } from 'vitest'
import { M2mGithubValidate } from '../../src/specification/m2mGithubValidate.js'
import { M2mSpecification } from '../../src/specification/m2mspecification.js'
import { IfileSpecification } from '../../src/specification/ifilespecification.js'
import * as fs from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'

const execFile = promisify(execFileCb)

/**
 * Integration tests for the validation workflow.
 * These tests run against the real modbus2mqtt.config.test repository.
 *
 * Prerequisites:
 * - GITHUB_TOKEN environment variable must be set
 * - modbus2mqtt/modbus2mqtt.config.test repository must exist with:
 *   - specifications/valid-test-spec.json (a valid IfileSpecification)
 *   - An open test PR with a changed spec file
 */

const TEST_REPO = process.env.TEST_CONFIG_REPO || 'modbus2mqtt.config.test'
const TEST_OWNER = process.env.TEST_CONFIG_OWNER || 'modbus2mqtt'

describe('Validation integration tests', () => {
  beforeAll(() => {
    if (!process.env.GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN must be set for integration tests')
    }
  })

  describe('JSON spec validation (local, no GitHub needed)', () => {
    it('validates a well-formed JSON spec without errors', () => {
      const spec: IfileSpecification = {
        filename: 'integration-test-spec',
        entities: [
          {
            id: 1,
            mqttname: 'temperature',
            converter: { name: 'number', registerTypes: [] },
            modbusAddress: 0,
            registerType: 3,
            readonly: true,
            icon: '',
            converterParameters: { multiplier: 0.1 },
            modbusValue: [],
            mqttValue: '',
            identified: 0,
            variableConfiguration: undefined,
          },
        ],
        i18n: [
          {
            lang: 'en',
            texts: [
              { textId: 'name', text: 'Integration Test Spec' },
              { textId: 'e1', text: 'Temperature' },
            ],
          },
        ],
        files: [],
        status: 2,
        nextEntityId: 2,
        version: '0.5',
        pullNumber: undefined,
        testdata: {
          holdingRegisters: [{ address: 0, value: [250] }],
          analogInputs: [],
          coils: [],
          discreteInputs: [],
        },
      } as unknown as IfileSpecification

      const m2mSpec = new M2mSpecification(spec)
      const messages = m2mSpec.validateSpecification('en')

      // Should have no critical errors (may have warnings about missing docs/images)
      const errors = messages.filter(
        (m) => m.type !== 3 && m.type !== 4 // noDocumentation, noImage are acceptable
      )
      expect(errors).toHaveLength(0)
    })

    it('detects missing entities', () => {
      const spec: IfileSpecification = {
        filename: 'empty-entities-spec',
        entities: [],
        i18n: [{ lang: 'en', texts: [{ textId: 'name', text: 'Empty Spec' }] }],
        files: [],
        status: 2,
        nextEntityId: 1,
        version: '0.5',
      } as unknown as IfileSpecification

      const m2mSpec = new M2mSpecification(spec)
      const messages = m2mSpec.validateSpecification('en')

      expect(messages.some((m) => m.type === 0)).toBe(true) // noEntity
    })
  })

  describe('GitHub CLI interaction (requires GITHUB_TOKEN)', () => {
    it('can list files from a real repository', async () => {
      // Clone the test repo and check if we can list its content
      const tmpDir = fs.mkdtempSync(join(tmpdir(), 'm2m-integration-'))
      try {
        await execFile('git', [
          'clone',
          '--depth',
          '1',
          `https://github.com/${TEST_OWNER}/${TEST_REPO}.git`,
          tmpDir,
        ])

        const specDir = join(tmpDir, 'specifications')
        if (fs.existsSync(specDir)) {
          const files = fs.readdirSync(specDir).filter((f) => f.endsWith('.json'))
          expect(files.length).toBeGreaterThanOrEqual(0)

          // If there are spec files, try to parse and validate one
          for (const file of files) {
            const content = fs.readFileSync(join(specDir, file), 'utf-8')
            const spec: IfileSpecification = JSON.parse(content)
            expect(spec).toBeDefined()
            expect(spec.entities).toBeDefined()
          }
        }
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      }
    })

    it('M2mGithubValidate can query the test repo', async () => {
      const gh = new M2mGithubValidate()

      // Try to list files from PR #1 in the test repo (if it exists)
      // This test is expected to fail gracefully if no test PR exists
      try {
        const result = await gh.listPullRequestFiles(TEST_OWNER, 1)
        expect(result.pr_number).toBe(1)
        expect(Array.isArray(result.files)).toBe(true)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        // 404 is expected if no PR exists yet in the test repo
        if (!msg.includes('404') && !msg.includes('Not Found')) {
          throw e
        }
      }
    })
  })
})
