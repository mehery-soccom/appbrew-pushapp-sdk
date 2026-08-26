import React from 'react'
import {
  ErrorCodes,
  OtpType,
  VerifiedOtpData,
  VerifyOtpApiResponseData,
} from '@gauntlet/types'
import { useAppStore, useBottomSheetModal, useLink, useUser } from '@gauntlet/state'
import useCountDownTimer from '@gauntlet/components/atoms/countdown-timer'
import EnvConfig from 'react-native-config'
import Toast from 'react-native-toast-message'
import { getMeheryTracker } from '../mehery/MeheryTracker'

function signInErrorMessage(result: unknown): string | null {
  if (!result) return null
  if (typeof result === 'string' && result.trim()) return result
  if (typeof result === 'object') {
    const r = result as Record<string, unknown>
    if (typeof r.error === 'string' && r.error.trim()) return r.error
    if (typeof r.message === 'string' && r.message.trim()) return r.message
  }
  return null
}

/**
 * Host override of @gauntlet/components otp-verification hooks.
 * Fixes: stuck verify button, double-verify races, closeModal-before-navigate
 * dropping the post-OTP sign-in transition, and missing Mehery OnUserLogin.
 */
export function useOtpVerification({
  type,
  showVerifyEmailStep,
  resendCodeButtonDisableTime,
  verifyButtonDisableTime,
  emailOtpSigninScreenId,
  otpVerificationScreenId,
  callingCode,
  phoneNumber,
  email,
  preVerifiedData,
  redirectTo,
  redirectParams,
  ...props
}: {
  type: OtpType
  showVerifyEmailStep: boolean
  resendCodeButtonDisableTime: number
  verifyButtonDisableTime: number
  emailOtpSigninScreenId: string
  otpVerificationScreenId: string
  callingCode?: string
  phoneNumber?: string
  email?: string
  preVerifiedData?: VerifiedOtpData
  redirectTo?: string
  redirectParams?: { [param: string]: string }
  requestId?: string
}) {
  const {
    generateOtp,
    verifyOtp,
    initiateSigninForVerifiedUser,
    updateFormData,
  } = useUser()
  const { gotoLink } = useLink()
  const { closeModal } = useBottomSheetModal()

  const [requestId, setrequestId] = React.useState<string | undefined>(
    props.requestId
  )
  const [errorMessage, setErrorMessage] = React.useState<string>('')
  const [isVerifyButtonDisabled, setIsVerifyButtonDisabled] =
    React.useState(false)
  const [isResendButtonDisabled, setIsResendButtonDisabled] =
    React.useState(false)
  const verifyingRef = React.useRef(false)
  const signedInRef = React.useRef(false)
  const { time, set } = useCountDownTimer({
    hours: 0,
    minutes: 0,
    seconds: 0,
  })

  const appId = EnvConfig['APP_ID'] as string
  const successRedirectScreen = redirectTo ?? 'account'

  React.useEffect(() => {
    updateFormData('otp-verification', {
      otp: '',
      isVerifyButtonDisabled: false,
    })
  }, [updateFormData])

  React.useEffect(() => {
    if (time.seconds === 0) {
      setIsResendButtonDisabled(false)
    }
  }, [time])

  const finishSignedIn = React.useCallback(() => {
    signedInRef.current = true
    verifyingRef.current = true
    setIsVerifyButtonDisabled(true)

    // Navigate first — closing the OTP modal before gotoLink races and
    // drops the transition (symptoms: stuck on OTP, no OnUserLogin).
    gotoLink({
      kind: 'screen',
      value: successRedirectScreen,
      params: redirectParams,
    })

    // Dismiss sheet after navigation is queued.
    setTimeout(() => {
      try {
        closeModal()
      } catch (e) {
        console.warn('[OtpVerification] closeModal after sign-in', e)
      }
    }, 300)

    // Belt-and-suspenders PushApp identity (in case SIGNIN_SUCCESS was missed).
    const userDetails = useAppStore.getState().user?.data?.userDetails
    if (userDetails?.status === 'idle' && userDetails?.data) {
      console.log('[OtpVerification] syncing Mehery identity after OTP sign-in')
      void getMeheryTracker().setUserDetails(userDetails.data)
    }

    Toast.show({
      type: 'success',
      text1: 'Sign in successfully.',
    })
  }, [closeModal, gotoLink, redirectParams, successRedirectScreen])

  const handleResendOtp = React.useCallback(async () => {
    try {
      if (isResendButtonDisabled || signedInRef.current) {
        return
      }
      const config = {
        appId,
        type,
        callingCode,
        phoneNumber,
        email,
      }
      const response = await generateOtp(config)
      if ('error' in response) {
        setErrorMessage(response.error)
        return
      }
      if (response?.requestId) {
        setrequestId(response.requestId)
      }
      verifyingRef.current = false
      setIsVerifyButtonDisabled(false)
      setIsResendButtonDisabled(true)
      setErrorMessage('')
      set({ hours: 0, minutes: 0, seconds: resendCodeButtonDisableTime })
      updateFormData('otp-verification', {
        otp: '',
        isVerifyButtonDisabled: false,
      })
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Something went wrong',
      })
      console.error(error)
    }
  }, [
    type,
    isResendButtonDisabled,
    set,
    generateOtp,
    callingCode,
    phoneNumber,
    email,
    resendCodeButtonDisableTime,
    appId,
    updateFormData,
  ])

  const handleVerifyOtp = React.useCallback(
    async ({
      otpInput,
      otpPinCount,
    }: {
      otpInput: string
      otpPinCount: number
    }) => {
      let lockDisabledForCooldown = false
      let keepLockedAfterSuccess = false
      try {
        if (signedInRef.current || verifyingRef.current) {
          console.log('[OtpVerification] verify skipped (already in flight / signed in)')
          return
        }
        if (!otpInput.length) {
          setErrorMessage('Code is required.')
          return
        }
        if (otpInput.length < otpPinCount) {
          setErrorMessage('Invalid code.')
          return
        }

        verifyingRef.current = true
        setIsVerifyButtonDisabled(true)
        setErrorMessage('')

        const config = {
          appId,
          type,
          callingCode,
          phoneNumber,
          email,
          otp: otpInput,
          preVerifiedData,
          requestId,
        }

        console.log('[OtpVerification] calling verifyOtp', {
          appId: Boolean(appId),
          type,
          email,
          phoneNumber,
          requestId,
          otpLen: otpInput.length,
        })

        const response = await Promise.race([
          verifyOtp(config),
          new Promise<never>((_, reject) => {
            setTimeout(
              () => reject(new Error('OTP verify timed out. Try again.')),
              25_000
            )
          }),
        ])

        console.log('[OtpVerification] verifyOtp response', response)
        if ('error' in response) {
          if (response?.errorCode === ErrorCodes.OTP_VERIFY_LIMIT_EXCEEDED) {
            lockDisabledForCooldown = true
            setIsResendButtonDisabled(true)
            setIsVerifyButtonDisabled(true)
            set({ hours: 0, minutes: 0, seconds: verifyButtonDisableTime })
          }
          setErrorMessage(response.error)
          Toast.show({
            type: 'error',
            text1: response.error || 'Invalid code',
          })
          return
        }
        const {
          isSuccess,
          customerExists,
          multipassToken,
          email: emailAddress,
          passKey,
          activationUrl,
          verificationToken,
        } = response as VerifyOtpApiResponseData

        if (!isSuccess) {
          setErrorMessage('Verification failed. Please try again.')
          Toast.show({
            type: 'error',
            text1: 'Verification failed. Please try again.',
          })
          return
        }

        if (customerExists) {
          updateFormData('otp-verification', {
            otp: otpInput,
            isVerifyButtonDisabled: true,
          })

          console.log('[OtpVerification] initiateSignin start', {
            email: emailAddress,
            hasMultipass: Boolean(multipassToken),
            hasPassKey: Boolean(passKey),
            hasActivationUrl: Boolean(activationUrl),
          })

          const result = await initiateSigninForVerifiedUser({
            email: emailAddress,
            multipassToken,
            passKey,
            activationUrl,
            provider: 'otp-signin',
            customerProps:
              preVerifiedData?.type === OtpType.PhoneNumber
                ? { link_existing_account: true }
                : {},
          })

          console.log('[OtpVerification] initiateSignin result', result)

          const err = signInErrorMessage(result)
          if (err) {
            const hint =
              /unidentified customer/i.test(err)
                ? ' (auth shop mismatch or invalid passKey — check catalog fallback / multipass)'
                : ''
            console.warn('[OtpVerification] Shopify sign-in failed', err + hint)
            Toast.show({
              type: 'error',
              text1: err,
            })
            setErrorMessage(err)
            updateFormData('otp-verification', {
              otp: '',
              isVerifyButtonDisabled: false,
            })
            return
          }

          keepLockedAfterSuccess = true
          finishSignedIn()
          updateFormData('otp-verification', {
            otp: '',
            isVerifyButtonDisabled: true,
          })
          return
        }

        if (customerExists === false && verificationToken) {
          const nextPreVerified: VerifiedOtpData = {
            callingCode,
            email,
            type,
            phoneNumber,
            verificationToken,
            requestId,
          }
          if (type === OtpType.Email) {
            keepLockedAfterSuccess = true
            gotoLink({
              kind: 'screen',
              value: 'otp-verification',
              params: {
                redirectTo: redirectTo,
                redirectParams,
                showOtpSignUpComponent: true,
                preVerifiedData: nextPreVerified,
              },
            })
            setTimeout(() => {
              try {
                closeModal()
              } catch {
                /* ignore */
              }
            }, 300)
            return
          }
          const screenValue = showVerifyEmailStep
            ? emailOtpSigninScreenId
            : otpVerificationScreenId
          const params = {
            type: OtpType.Email,
            preVerifiedData: nextPreVerified,
            redirectTo,
            redirectParams,
          } as any
          if (!showVerifyEmailStep) {
            params.showOtpSignUpComponent = true
            params.email = ''
          }
          keepLockedAfterSuccess = true
          gotoLink({
            kind: 'screen',
            value: screenValue,
            params,
          })
          return
        }

        setErrorMessage('Verification failed. Please try again.')
      } catch (error: any) {
        Toast.show({
          type: 'error',
          text1:
            error instanceof Error ? error.message : 'Something went wrong',
        })
        console.error('[OtpVerification] verify failed', error)
      } finally {
        if (!keepLockedAfterSuccess && !signedInRef.current) {
          verifyingRef.current = false
          if (!lockDisabledForCooldown) {
            setIsVerifyButtonDisabled(false)
            updateFormData('otp-verification', {
              otp: otpInput,
              isVerifyButtonDisabled: false,
            })
          }
        }
      }
    },
    [
      type,
      showVerifyEmailStep,
      gotoLink,
      verifyOtp,
      initiateSigninForVerifiedUser,
      callingCode,
      phoneNumber,
      email,
      preVerifiedData,
      redirectTo,
      redirectParams,
      appId,
      set,
      verifyButtonDisableTime,
      updateFormData,
      requestId,
      emailOtpSigninScreenId,
      otpVerificationScreenId,
      closeModal,
      finishSignedIn,
    ]
  )

  return React.useMemo(
    () => ({
      handleVerifyOtp,
      handleResendOtp,
      errorMessage,
      isVerifyButtonDisabled,
      isResendButtonDisabled,
      time,
    }),
    [
      handleVerifyOtp,
      handleResendOtp,
      errorMessage,
      isVerifyButtonDisabled,
      isResendButtonDisabled,
      time,
    ]
  )
}
