import { Button } from '@gauntlet/components/atoms/button'
import {
  useBlockSettings,
  useBlockStyle,
} from '@gauntlet/components/style-utils'
import { useAppStore, useBlock, useLink, useUser } from '@gauntlet/state'
import { BaseBlockProps, OtpType, VerifiedOtpData } from '@gauntlet/types'
import { useSmsUserConsent } from '@eabdullazyanov/react-native-sms-user-consent'
import React from 'react'
import { Keyboard, Text, View } from 'react-native'
import { OtpCodeInput } from './OtpCodeInput'
import { OtpSignUp } from './OtpSignUp'
import { useOtpVerification } from './useOtpVerification'

export type OtpVerificationProps = BaseBlockProps & {
  callingCode?: string
  phoneNumber?: string
  email?: string
  type?: OtpType
  showOtpSignUpComponent?: boolean
  preVerifiedData?: VerifiedOtpData
  redirectTo?: string
  redirectParams?: { [param: string]: string }
  requestId?: string
  resetLink?: {
    kind: string
    value: string
    params?: { [param: string]: string }
  }
}

function resolveModalOptions(): Record<string, any> {
  return (
    (useAppStore.getState().modal?.modalState?.openedModalOptions as Record<
      string,
      any
    >) ?? {}
  )
}

/**
 * Host override of @gauntlet/components otp-verification.
 * Replaces broken multi-field OTPInputView with a BottomSheet-safe input.
 */
export function OtpVerification({
  componentId,
  instanceId,
  screenId,
  callingCode: callingCodeProp,
  phoneNumber: phoneNumberProp,
  email: emailProp,
  type: typeProp,
  preVerifiedData: preVerifiedDataProp,
  showOtpSignUpComponent: showSignUpProp = false,
  redirectTo: redirectToProp,
  redirectParams: redirectParamsProp,
  requestId: requestIdProp,
  resetLink: resetLinkProp,
}: OtpVerificationProps) {
  // ModalBrewery spreads openedModalOptions, but nested scroll/route races can
  // drop props — fall back to modal state so verify always has email/requestId.
  const modalOptions = resolveModalOptions()
  const callingCode = callingCodeProp ?? modalOptions.callingCode
  const phoneNumber = phoneNumberProp ?? modalOptions.phoneNumber
  const email = emailProp ?? modalOptions.email
  const type = (typeProp ?? modalOptions.type ?? OtpType.Email) as OtpType
  const preVerifiedData =
    preVerifiedDataProp ?? modalOptions.preVerifiedData
  const showOtpSignUpComponent =
    showSignUpProp || modalOptions.showOtpSignUpComponent === true
  const redirectTo = redirectToProp ?? modalOptions.redirectTo
  const redirectParams = redirectParamsProp ?? modalOptions.redirectParams
  const requestId = requestIdProp ?? modalOptions.requestId
  const resetLink = resetLinkProp ?? modalOptions.resetLink

  const block = useBlock(screenId, componentId, instanceId)
  const style = useBlockStyle(block, { themeKey: 'otp-verification' })
  const { options, source } = useBlockSettings(block)
  const otpPinCount =
    useAppStore.getState().config.data?.integrations?.otpSignin?.otpPinCount ??
    6
  const retrievedCode = useSmsUserConsent(otpPinCount)
  const {
    time,
    isResendButtonDisabled,
    isVerifyButtonDisabled,
    errorMessage,
    handleResendOtp,
    handleVerifyOtp,
  } = useOtpVerification({
    type,
    showVerifyEmailStep: options.showVerifyEmailStep ?? true,
    resendCodeButtonDisableTime: options.resendCodeButtonDisableTime ?? 30,
    verifyButtonDisableTime: options.verifyButtonDisableTime ?? 30,
    otpVerificationScreenId:
      source?.otpVerificationScreenId ?? 'otp-verification',
    emailOtpSigninScreenId: source?.emailOtpSigninScreenId ?? 'otp-email-login',
    callingCode,
    phoneNumber,
    email,
    preVerifiedData,
    redirectTo,
    redirectParams,
    requestId,
  })
  const { getFormData } = useUser()
  const { back, gotoLink } = useLink()

  const [otpInput, setOtpInput] = React.useState<string>(
    (getFormData('otp-verification') as any)?.otp ?? ''
  )

  const runVerify = React.useCallback(
    async (code: string) => {
      Keyboard.dismiss()
      console.log('[OtpVerification] verify start', {
        len: code.length,
        otpPinCount,
        email,
        type,
        requestId,
      })
      await handleVerifyOtp({
        otpInput: code,
        otpPinCount,
      })
    },
    [email, handleVerifyOtp, otpPinCount, requestId, type]
  )

  React.useEffect(() => {
    if (retrievedCode) {
      setOtpInput(retrievedCode)
      void runVerify(retrievedCode)
    }
  }, [retrievedCode, runVerify])

  const onCodeChange = React.useCallback(
    (code: string) => {
      setOtpInput(code)
      if (code.length === otpPinCount) {
        void runVerify(code)
      }
    },
    [otpPinCount, runVerify]
  )

  if (showOtpSignUpComponent) {
    return (
      <View style={style.root}>
        <OtpSignUp
          callingCode={preVerifiedData?.callingCode ?? ''}
          phoneNumber={preVerifiedData?.phoneNumber ?? ''}
          email={email ?? preVerifiedData?.email ?? ''}
          verificationToken={preVerifiedData?.verificationToken ?? ''}
          type={preVerifiedData?.type}
          style={style?.otpSignup}
          sections={options?.otpSignup?.sections?.map((section: any) => ({
            ...section,
            fields: (section.fields ?? []).filter((field: any) =>
              preVerifiedData?.type === OtpType.Email
                ? field.id !== 'email'
                : preVerifiedData?.type === OtpType.PhoneNumber
                  ? field.id !== 'phone'
                  : true
            ),
          }))}
          redirectTo={redirectTo}
          redirectParams={redirectParams}
          source={source}
        />
      </View>
    )
  }

  const canVerify =
    otpInput.length >= otpPinCount && !isVerifyButtonDisabled

  return (
    <View style={style.root}>
      <View>
        <Text style={style.sectionHeading}>
          {source?.heading ?? `Enter ${otpPinCount}-digit code`}
        </Text>
        <Text style={style.verifyOtpMessage.text}>
          Please input the code send to
          <Text style={style.verifyOtpMessage.phoneNumber}>
            {` ${type === OtpType.PhoneNumber ? phoneNumber : email}. `}
          </Text>
          Not your {type === OtpType.PhoneNumber ? 'number' : 'email'}?
          <Text
            style={style.verifyOtpMessage.resetButton}
            onPress={() => {
              if (resetLink) {
                gotoLink(resetLink)
              } else {
                back()
              }
            }}
          >
            {' '}
            reset
          </Text>
        </Text>

        <View style={style.otpInputContainer}>
          <OtpCodeInput
            pinCount={otpPinCount}
            value={otpInput}
            onChange={onCodeChange}
            containerStyle={style.otpInputStyle}
            fieldStyle={
              errorMessage
                ? style.otpInputFieldErrorStyle
                : style.otpInputFieldStyle
            }
            highlightStyle={style.otpInputHighlightedStyle}
            editable={true}
          />
          {Boolean(errorMessage) ? (
            <Text style={style.otpInputErrorMessageText}>{errorMessage}</Text>
          ) : null}
        </View>
        <Button
          disabled={!canVerify}
          onPress={() => runVerify(otpInput)}
          title={
            type === OtpType.PhoneNumber
              ? (source?.phoneVerifyButtonTitle ?? 'Verify Phone Number')
              : (source?.emailVerifyButtonTitle ?? 'Verify Email')
          }
          style={
            !canVerify
              ? style.verifyPhoneNumberButtonDisabled
              : style.verifyPhoneNumberButton
          }
        />
        <Text
          style={
            isResendButtonDisabled
              ? style.resendCodeButtonDisabled
              : style.resendCodeButton
          }
          onPress={handleResendOtp}
        >
          {source?.resendButtonText ?? 'Resend code'}
        </Text>
        {time.seconds ? (
          <Text style={style.timerText}>{time.seconds} seconds</Text>
        ) : null}
      </View>
    </View>
  )
}
