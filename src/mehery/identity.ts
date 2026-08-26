import { ensureSdkReady } from './sdk'

/** Shopify GID → bare customer id; otherwise leave unchanged (incl. email). */
export function toMeheryUserId(raw: string): string {
  const match = /^gid:\/\/shopify\/Customer\/(\d+)$/i.exec(String(raw).trim())
  return match ? match[1] : String(raw)
}

export async function meheryOnUserLogin(userId: string) {
  const sdk = await ensureSdkReady()
  return sdk.OnUserLogin(toMeheryUserId(userId))
}

export async function meheryOnUserLogOut(userId: string) {
  const sdk = await ensureSdkReady()
  return sdk.OnUserLogOut(toMeheryUserId(userId))
}

export async function meheryUpdateUserProfile(
  additionalInfo: Record<string, unknown>,
  cohorts?: Record<string, unknown>
) {
  const sdk = await ensureSdkReady()
  return sdk.updateUserProfile(additionalInfo, cohorts)
}
