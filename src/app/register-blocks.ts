import { blockRegistry, registerCommonBlocks } from '@gauntlet/block-registry'
export function registerBlocks() {
  const r = blockRegistry
  registerCommonBlocks(r)
}
