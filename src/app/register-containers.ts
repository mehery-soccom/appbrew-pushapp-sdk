import {
  containerRegistry,
  registerCommonContainers,
} from '@gauntlet/container-registry'

export function registerContainers() {
  const r = containerRegistry
  registerCommonContainers(r)
}
