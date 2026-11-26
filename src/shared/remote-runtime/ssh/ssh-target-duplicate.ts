import type { SshTarget } from './ssh-types'

/**
 * Fork from upstream, kept deliberately: upstream keys duplicate detection on config
 * alias / label, while Orca keys it on the connection endpoint — the host+port+username
 * triple — and treats alias (configHost, label) as display-only. Reason (railans fleet,
 * re.eval framing): every railans host registers with the explicit `dev` username while
 * the upstream add dialog still allows a blank one, so an alias-keyed check let the
 * same machine back in under a renamed label, splitting one endpoint into two targets.
 * A blank username on either side matches anything so the rule cannot be bypassed by
 * omitting the user.
 * Rebase guard: keep the endpoint-triple rule; do not restore the upstream alias
 * comparison.
 */

/** True when an existing Orca target already serves this host+port+username endpoint. */
export function isDuplicateSshTargetEndpoint({
  existingTargets,
  host,
  port,
  username
}: {
  existingTargets: readonly Pick<SshTarget, 'host' | 'port' | 'username'>[]
  host: string
  port: number
  username: string
}): boolean {
  return existingTargets.some(
    (target) =>
      target.host === host &&
      target.port === port &&
      // Why: equal usernames collide, and a blank one on either side matches any user.
      (username === target.username || username === '' || target.username === '')
  )
}
