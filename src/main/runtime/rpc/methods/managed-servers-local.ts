import { app } from 'electron'
import { defineMethod, InvalidArgumentError } from '../core'
import { ManagedServerSelector } from '../../../../shared/rpc-contract/host-management/managed-server-params'
import { resolveEnvironment } from '../../../../shared/remote-runtime/host-store/runtime-environment-store-operations'
import { removeManagedOrcadEnvironment } from '../../../../shared/remote-runtime/host-store/runtime-environment-managed-orcad-store'
import { getOrcadSshDeployment } from '../../../../shared/remote-runtime/host-catalog/runtime-environments'
import { getSshTargetRegistryStore } from '../../../ssh/targets/ssh-target-registry'
import { isRuntimeOwnedSshTarget } from '../../../ssh/targets/ssh-target-runtime-ownership'
import { requireManagedOrcadInfrastructure } from '../../../managed-server/lifecycle/orcad-managed-runtime-context'

/**
 * LOCAL FORK (railans): headless `serve` publishes no managed-server actions
 * (`getManagedServerActions()` is null), so `managedServer.forget` answers
 * `managed_server_unavailable` there and a dead host record cannot be cleared without the
 * desktop UI. This method performs the *forget* half only: drop the local registration and
 * its runtime-owned SSH target, without contacting the host and without claiming the remote
 * server stopped (same "unverifiable" verdict the desktop Forget reports).
 * It deliberately does not implement Stop — stopping needs the live server.
 */
export const MANAGED_SERVER_LOCAL_METHODS = [
  defineMethod({
    name: 'managedServer.forgetLocal',
    permission: 'host-admin',
    params: ManagedServerSelector,
    handler: async (params) => {
      const userDataPath = app.getPath('userData')
      let environment
      try {
        environment = resolveEnvironment(userDataPath, params.selector)
      } catch {
        throw new InvalidArgumentError(
          `No Orca server matched "${params.selector}". Run \`orca environment list\` for selectors.`
        )
      }
      const deployment = getOrcadSshDeployment(environment)
      if (!deployment) {
        throw new InvalidArgumentError(
          `${environment.name ?? params.selector} is not a managed Orca server; nothing to forget.`
        )
      }
      await removeManagedOrcadEnvironment(userDataPath, environment.id)
      // Only a target Orca created goes away with the registration. A user-created target that
      // was merely fenced by this environment must keep its place in the registry: release the
      // claim the way the desktop forget does instead of deleting it.
      const store = getSshTargetRegistryStore()
      const target = store?.getTarget(deployment.sshTargetId)
      if (store && target && isRuntimeOwnedSshTarget(target)) {
        store.removeTarget(deployment.sshTargetId)
      } else if (target) {
        const { claims } = requireManagedOrcadInfrastructure()
        claims.releaseForUserRemoval(deployment.sshTargetId, environment.id)
        await claims.flush()
      }
      return {
        result: {
          outcome: 'forgotten',
          verdict: 'unverifiable',
          environmentId: environment.id,
          sshTargetId: deployment.sshTargetId
        }
      }
    }
  })
]
