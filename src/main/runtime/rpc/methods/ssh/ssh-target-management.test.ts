import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../../dispatcher'
import type { RpcRequest } from '../../core'
import type { RpcCallerScope } from '../../callers/rpc-caller-scope'
import { OrcaRuntimeService } from '../../../orca-runtime'
import { SSH_EDITABLE_TARGET_FIELDS } from '../../../../../shared/remote-runtime/ssh/ssh-target-management'
import { SSH_METHODS } from './ssh'

const mocks = vi.hoisted(() => ({
  getRegisteredSshState: vi.fn(),
  listRegisteredSshTargets: vi.fn(),
  mutations: { add: vi.fn(), update: vi.fn(), remove: vi.fn() },
  getSshConnectionManager: vi.fn(),
  browseSshDirectory: vi.fn()
}))

vi.mock('../../../../ssh/targets/ssh-target-registry', () => ({
  connectRegisteredSshTarget: vi.fn(),
  getRegisteredSshState: mocks.getRegisteredSshState,
  getRegisteredSshTargetMutations: () => mocks.mutations,
  getSshConnectionManager: mocks.getSshConnectionManager,
  listRegisteredRemovedSshTargetLabels: vi.fn(() => ({})),
  listRegisteredSshTargets: mocks.listRegisteredSshTargets
}))

vi.mock('../../../../ssh/filesystem/ssh-remote-directory-browse', () => ({
  browseSshDirectory: mocks.browseSshDirectory
}))

const SECRET_PASSWORD = 'hunter2-password'
const SECRET_PASSPHRASE = 'key-passphrase-value'

// A stored row carrying keys no paired client may see: secrets (as a malformed or future profile
// might hold) and main-owned fields.
const storedTarget = {
  id: 'ssh-1',
  label: 'Dev box',
  host: 'dev.internal',
  port: 2222,
  username: 'me',
  identityFile: '~/.ssh/id_ed25519',
  jumpHost: 'bastion',
  source: 'manual',
  generation: 4,
  password: SECRET_PASSWORD,
  passphrase: SECRET_PASSPHRASE,
  lastRequiredPassphrase: true,
  remoteRuntimeResolution: { rung: 'A' },
  owner: undefined
}

const runtime = new OrcaRuntimeService()

function dispatch(method: string, params?: unknown, callerScope?: RpcCallerScope) {
  const dispatcher = new RpcDispatcher({ runtime, methods: SSH_METHODS, callerScope })
  const request: RpcRequest = { id: 'req-1', authToken: 'tok', method, params }
  return dispatcher.dispatch(request)
}

function expectNoSecrets(value: unknown): void {
  const serialized = JSON.stringify(value)
  expect(serialized).not.toContain(SECRET_PASSWORD)
  expect(serialized).not.toContain(SECRET_PASSPHRASE)
  expect(serialized).not.toContain('lastRequiredPassphrase')
  expect(serialized).not.toContain('remoteRuntimeResolution')
}

function listedTargetKeys(response: unknown): string[] {
  const parsed: unknown = JSON.parse(JSON.stringify(response))
  if (typeof parsed !== 'object' || parsed === null || !('result' in parsed)) {
    return []
  }
  const { result } = parsed
  if (typeof result !== 'object' || result === null || !('targets' in result)) {
    return []
  }
  const [first] = Array.isArray(result.targets) ? result.targets : []
  return typeof first === 'object' && first !== null ? Object.keys(first) : []
}

const ALLOWED_VIEW_KEYS = new Set<string>([
  ...SSH_EDITABLE_TARGET_FIELDS,
  'id',
  'generation',
  'connected',
  'connectionStatus',
  'remotePlatform',
  'source',
  'managedServer'
])

describe('server SSH target management RPC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getRegisteredSshState.mockReturnValue({ status: 'connected' })
  })

  it('lists editable fields only; secrets and main-owned fields never leave the server', async () => {
    mocks.listRegisteredSshTargets.mockReturnValue([storedTarget])

    const response = await dispatch('ssh.listEditableTargets')

    expect(response).toMatchObject({
      ok: true,
      result: {
        targets: [
          {
            id: 'ssh-1',
            label: 'Dev box',
            host: 'dev.internal',
            port: 2222,
            username: 'me',
            identityFile: '~/.ssh/id_ed25519',
            jumpHost: 'bastion',
            generation: 4,
            connected: true,
            connectionStatus: 'connected',
            source: 'manual'
          }
        ]
      }
    })
    expectNoSecrets(response)
    expect(listedTargetKeys(response).filter((key) => !ALLOWED_VIEW_KEYS.has(key))).toEqual([])
  })
})

describe('ssh.addTarget duplicate endpoint guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getRegisteredSshState.mockReturnValue({ status: 'connected' })
  })

  it('refuses a duplicate endpoint and names the host and port', async () => {
    // Why this shape: the rule is the host+port+username triple (see the shared module's
    // fork note), so a blank username cannot dodge an explicit one on the same endpoint.
    mocks.listRegisteredSshTargets.mockReturnValue([
      { host: '127.0.0.1', port: 22133, username: 'dev' }
    ])

    const response = await dispatch('ssh.addTarget', {
      target: { label: 'Other', host: '127.0.0.1', port: 22133, username: '' }
    })

    expect(response).toMatchObject({
      ok: false,
      error: {
        code: 'invalid_argument',
        message: 'That SSH host is already in Orca (127.0.0.1:22133).'
      }
    })
    expect(mocks.mutations.add).not.toHaveBeenCalled()
  })

  it('registers a different endpoint even when the label matches an existing target', async () => {
    // Fork guard: labels are display-only, so a new endpoint must still register.
    mocks.listRegisteredSshTargets.mockReturnValue([
      { label: 'prod', host: '10.0.0.1', port: 22, username: 'dev' }
    ])
    mocks.mutations.add.mockReturnValue({
      target: { ...storedTarget, label: 'prod', host: '10.0.0.2' },
      repoReadoptions: []
    })

    const response = await dispatch('ssh.addTarget', {
      target: { label: 'prod', host: '10.0.0.2', port: 22, username: 'dev' }
    })

    expect(response).toMatchObject({
      ok: true,
      result: { target: { label: 'prod', host: '10.0.0.2' } }
    })
    expect(mocks.mutations.add).toHaveBeenCalledTimes(1)
  })
})
