import { describe, expect, it } from 'vitest'
import { isDuplicateSshTargetEndpoint } from './ssh-target-duplicate'
import type { SshTarget } from './ssh-types'

type EndpointRow = Pick<SshTarget, 'host' | 'port' | 'username'> &
  Partial<Pick<SshTarget, 'configHost' | 'label'>>

function existing(...rows: EndpointRow[]): EndpointRow[] {
  return rows
}

describe('isDuplicateSshTargetEndpoint', () => {
  it('rejects the same host, port and username', () => {
    expect(
      isDuplicateSshTargetEndpoint({
        existingTargets: existing({ host: '127.0.0.1', port: 22133, username: 'dev' }),
        host: '127.0.0.1',
        port: 22133,
        username: 'dev'
      })
    ).toBe(true)
  })

  it('allows the same host and port with a different username', () => {
    expect(
      isDuplicateSshTargetEndpoint({
        existingTargets: existing({ host: '127.0.0.1', port: 22133, username: 'dev' }),
        host: '127.0.0.1',
        port: 22133,
        username: 'ci'
      })
    ).toBe(false)
  })

  it('allows a different port on the same host', () => {
    expect(
      isDuplicateSshTargetEndpoint({
        existingTargets: existing({ host: '127.0.0.1', port: 22, username: 'dev' }),
        host: '127.0.0.1',
        port: 22133,
        username: 'dev'
      })
    ).toBe(false)
  })

  it('allows a different host on the same port and username', () => {
    expect(
      isDuplicateSshTargetEndpoint({
        existingTargets: existing({ host: 'box-a', port: 22133, username: 'dev' }),
        host: 'box-b',
        port: 22133,
        username: 'dev'
      })
    ).toBe(false)
  })

  it('matches a blank existing username against an explicit one', () => {
    expect(
      isDuplicateSshTargetEndpoint({
        existingTargets: existing({ host: '127.0.0.1', port: 22133, username: '' }),
        host: '127.0.0.1',
        port: 22133,
        username: 'dev'
      })
    ).toBe(true)
  })

  it('matches an explicit existing username against a blank one', () => {
    expect(
      isDuplicateSshTargetEndpoint({
        existingTargets: existing({ host: '127.0.0.1', port: 22133, username: 'dev' }),
        host: '127.0.0.1',
        port: 22133,
        username: ''
      })
    ).toBe(true)
  })

  it('matches two blank usernames on the same endpoint', () => {
    expect(
      isDuplicateSshTargetEndpoint({
        existingTargets: existing({ host: '127.0.0.1', port: 22, username: '' }),
        host: '127.0.0.1',
        port: 22,
        username: ''
      })
    ).toBe(true)
  })

  // Fork guard: aliases ride along on real rows but must not sway the verdict either way.
  it('ignores a renamed label when the endpoint matches', () => {
    expect(
      isDuplicateSshTargetEndpoint({
        existingTargets: existing({
          host: '127.0.0.1',
          port: 22133,
          username: 'dev',
          configHost: 'box1',
          label: 'prod'
        }),
        host: '127.0.0.1',
        port: 22133,
        username: 'dev'
      })
    ).toBe(true)
  })

  it('ignores a colliding label when the endpoint differs', () => {
    expect(
      isDuplicateSshTargetEndpoint({
        existingTargets: existing({
          host: '10.0.0.1',
          port: 22,
          username: 'dev',
          configHost: 'prod',
          label: 'prod'
        }),
        host: '10.0.0.2',
        port: 22,
        username: 'dev'
      })
    ).toBe(false)
  })
})
