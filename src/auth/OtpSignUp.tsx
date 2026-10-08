import { Button } from '@gauntlet/components/atoms/button'
import { AddressFormInputField } from '@gauntlet/components/organisms/address-form-input-field'
import { getModifiedSections } from '@gauntlet/components/organisms/address-form'
import { useAppStore, useLink, useUser } from '@gauntlet/state'
import EnvConfig from 'react-native-config'
import React from 'react'
import { FieldErrors, useForm } from 'react-hook-form'
import { Text, View } from 'react-native'
import PhoneInput from 'react-native-phone-number-input'
import {
  CreateUserRequestForOtpSignIn,
  ErrorCodes,
  OtpType,
} from '@gauntlet/types'
import Toast from 'react-native-toast-message'
import { formatDateToYYYYMMDD } from '@gauntlet/components/organisms/profile-edit/utils'
import { parsePhoneNumberWithError } from 'libphonenumber-js'
import { getMeheryTracker, formatOtpPhone, mergeMeheryIdentityFields } from 'react-native-pushapp-appbrew/appbrew'

interface CreateUserFormInputs {
  firstName: string
  lastName: string
  phone: string
  email: string
  birthdate?: string
  [key: string]: string | undefined
}

export type OtpSignUpProps = {
  callingCode?: string
  phoneNumber: string
  email?: string
  type?: OtpType
  verificationToken: string
  style: any
  sections: any
  source?: any
  redirectTo?: string
  redirectParams?: { [param: string]: string }
}

/**
 * Host override of @gauntlet/components OtpSignUp.
 *
 * Gauntlet's version fails silently when react-hook-form validation rejects
 * (common for phone: pattern /^\+\d+$/ while the CTA only gates on name/email),
 * so "Create account" looks dead after tap. Also harden phone extraction and
 * treat any non-error otpSignUp result as success so navigation always runs.
 */
export function OtpSignUp({
  callingCode,
  phoneNumber,
  email,
  verificationToken,
  style,
  sections,
  source,
  redirectTo,
  redirectParams,
  type,
}: OtpSignUpProps) {
  const { otpSignUp, updateProfile } = useUser()
  const { gotoLink } = useLink()

  const phoneInputRef = React.useRef<PhoneInput>(null)
  const safeStyle = style ?? {}
  const safeSections = Array.isArray(sections) ? sections : []

  const { control, watch, handleSubmit, formState, setError, clearErrors } =
    useForm<CreateUserFormInputs>({
      reValidateMode: 'onChange',
      defaultValues: {
        firstName: '',
        lastName: '',
        email: email ?? '',
        phone: phoneNumber ? `+${callingCode ?? ''}${phoneNumber}` : '',
      },
    })

  const [isSubmitButtonDisabled, setIsSubmitButtonDisabled] =
    React.useState<boolean>(false)

  const updatedSections = getModifiedSections(safeSections)
  const hasPhoneField = updatedSections.some((section) =>
    section.fields?.some(
      (field: { id?: string }) =>
        field.id === 'phone' || field.id === 'phone-country'
    )
  )

  const appId = EnvConfig.APP_ID
  const successRedirectScreen = redirectTo ?? 'account'

  const firstName = watch('firstName')
  const lastName = watch('lastName')
  const watchedEmail = watch('email')
  const watchedPhone = watch('phone')

  const isButtonDisabled =
    !firstName ||
    !lastName ||
    !watchedEmail ||
    (hasPhoneField && !watchedPhone) ||
    isSubmitButtonDisabled ||
    !verificationToken

  const resolvePhoneParts = (data: CreateUserFormInputs) => {
    const fromRefNumber = phoneInputRef.current?.state?.number?.toString() ?? ''
    const fromRefCalling = phoneInputRef.current?.getCallingCode?.() ?? ''

    if (fromRefNumber) {
      return {
        phoneNumber: fromRefNumber,
        callingCode: fromRefCalling || callingCode || '',
      }
    }

    if (phoneNumber && !fromRefNumber) {
      return {
        phoneNumber,
        callingCode: callingCode || fromRefCalling || '',
      }
    }

    const raw = (data.phone ?? '').trim()
    if (!raw) {
      return { phoneNumber: '', callingCode: callingCode || '' }
    }

    try {
      const parsed = parsePhoneNumberWithError(
        raw.startsWith('+') ? raw : `+${raw}`
      )
      return {
        phoneNumber: parsed.nationalNumber,
        callingCode: parsed.countryCallingCode,
      }
    } catch {
      return {
        phoneNumber: raw.replace(/^\+/, ''),
        callingCode: callingCode || '',
      }
    }
  }

  const onInvalid = (errors: FieldErrors<CreateUserFormInputs>) => {
    const first = Object.values(errors).find(Boolean) as
      | { message?: string }
      | undefined
    Toast.show({
      type: 'error',
      text1: first?.message ?? 'Please fix the highlighted fields',
    })
  }

  const handleCreateUser = async (data: CreateUserFormInputs) => {
    try {
      if (!verificationToken) {
        Toast.show({
          type: 'error',
          text1: 'Verification expired. Please request a new code.',
        })
        return
      }
      if (!appId) {
        Toast.show({
          type: 'error',
          text1: 'App configuration missing. Rebuild the app and try again.',
        })
        return
      }

      setIsSubmitButtonDisabled(true)

      const phoneParts = resolvePhoneParts(data)
      const createUserData: CreateUserRequestForOtpSignIn = {
        ...data,
        type,
        appId,
        verificationToken,
        phoneNumber: phoneParts.phoneNumber,
        callingCode: phoneParts.callingCode,
      }

      const response = await otpSignUp(createUserData)

      if (response && 'error' in response && response.error) {
        if (response?.errorCode === ErrorCodes.EMAIL_ALREADY_EXISTS) {
          setError('email', {
            type: 'manual',
            message: response.error,
          })
          Toast.show({
            type: 'error',
            text1: response.error,
          })
          return
        }
        Toast.show({
          type: 'error',
          text1: response.error,
        })
        return
      }

      if (
        Object.keys(createUserData).includes('birthdate') &&
        createUserData['birthdate']
      ) {
        const res = await updateProfile({
          metafields: {
            date_of_birth: formatDateToYYYYMMDD(createUserData['birthdate']),
          },
        })
        if (res && 'error' in res) {
          const message =
            Array.isArray(res.errors) && res.errors.length > 0
              ? res.errors.join('\n')
              : res.error
          console.log('[OtpSignUp] birthdate profile update failed', message)
        }
      }

      // PushApp profile: form has firstName/lastName before the store may.
      // Flat { name, phones, email } → SDK PUT string name + phones[] + additionalInfo.email.
      try {
        const storeDetails = useAppStore.getState().user?.data?.userDetails
        const storeCustomer =
          storeDetails?.status === 'idle' && storeDetails?.data
            ? storeDetails.data
            : {}
        const otpPhone = formatOtpPhone(
          phoneParts.callingCode,
          phoneParts.phoneNumber
        )
        const customer = mergeMeheryIdentityFields(
          {
            ...(typeof storeCustomer === 'object' && storeCustomer
              ? storeCustomer
              : {}),
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email || (storeCustomer as { email?: string })?.email,
          },
          {
            phone: otpPhone,
            email: data.email || (storeCustomer as { email?: string })?.email,
          }
        )
        console.log('[OtpSignUp] syncing Mehery profile after account create', {
          name: `${data.firstName} ${data.lastName}`.trim(),
          email: data.email,
          hasPhone: Boolean(otpPhone),
        })
        await getMeheryTracker().setUserDetails(customer)
      } catch (meheryError) {
        console.warn(
          '[OtpSignUp] Mehery profile sync after create failed',
          meheryError
        )
      }

      gotoLink({
        kind: 'screen',
        value: successRedirectScreen,
        params: redirectParams,
      })
      Toast.show({
        type: 'success',
        text1: 'Account created successfully',
      })
    } catch (error: any) {
      console.error('[OtpSignUp] create account failed', error)
      Toast.show({
        type: 'error',
        text1:
          error instanceof Error
            ? error.message
            : 'Something went wrong creating your account',
      })
    } finally {
      setIsSubmitButtonDisabled(false)
    }
  }

  return (
    <View style={safeStyle.root}>
      {updatedSections.map(({ title, fields }, index) => {
        return (
          <React.Fragment key={index}>
            <Text style={safeStyle.sectionHeading}>{title}</Text>
            <Text style={safeStyle.sectionSubheadingText}>
              Please provide information that we can use to identify you
            </Text>
            {fields.map((field: any) => {
              return (
                <AddressFormInputField
                  {...field}
                  clearErrors={clearErrors}
                  setError={setError}
                  formState={formState}
                  control={control}
                  phoneInputRef={phoneInputRef}
                  style={safeStyle}
                  key={field.id}
                />
              )
            })}
          </React.Fragment>
        )
      })}

      <Button
        onPress={handleSubmit(handleCreateUser, onInvalid)}
        disabled={isButtonDisabled}
        title={source?.createAccountButtonTitle ?? 'Create account'}
        style={
          isButtonDisabled
            ? { ...(safeStyle.createAccountButton ?? {}), opacity: 0.4 }
            : safeStyle.createAccountButton ?? {}
        }
      />
    </View>
  )
}
