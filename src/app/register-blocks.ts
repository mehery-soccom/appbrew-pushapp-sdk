import { blockRegistry, registerCommonBlocks } from '@gauntlet/block-registry'
import { OtpVerification } from '../auth/OtpVerification'

export function registerBlocks() {
  const r = blockRegistry
  registerCommonBlocks(r)
  // Host override: BottomSheet-safe OTP input (fixes stuck focus after 1–2 digits).
  r.set('otp-verification', OtpVerification)
}
