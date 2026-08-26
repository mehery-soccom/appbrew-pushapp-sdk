import React from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
  TextStyle,
  StyleProp,
  Platform,
} from 'react-native'
import { BottomSheetTextInput } from '@gorhom/bottom-sheet'

type OtpCodeInputProps = {
  pinCount: number
  value: string
  onChange: (code: string) => void
  containerStyle?: StyleProp<ViewStyle>
  fieldStyle?: StyleProp<TextStyle>
  highlightStyle?: StyleProp<TextStyle>
  autoFocus?: boolean
  editable?: boolean
}

/**
 * Single-field OTP input for BottomSheet + New Arch.
 * iOS modal uses BottomSheetTextInput; Android uses RN TextInput — gorhom's
 * input can drop presses / lag behind visible digits on Android sheets.
 */
export function OtpCodeInput({
  pinCount,
  value,
  onChange,
  containerStyle,
  fieldStyle,
  highlightStyle,
  autoFocus = true,
  editable = true,
}: OtpCodeInputProps) {
  const inputRef = React.useRef<TextInput | null>(null)
  const digits = value.replace(/\D/g, '').slice(0, pinCount)
  const focusedIndex = Math.min(digits.length, pinCount - 1)
  const InputComponent =
    Platform.OS === 'ios' ? BottomSheetTextInput : TextInput

  React.useEffect(() => {
    if (!autoFocus || !editable) return
    const t = setTimeout(() => inputRef.current?.focus(), 350)
    return () => clearTimeout(t)
  }, [autoFocus, editable])

  const handleChange: TextInputProps['onChangeText'] = (text) => {
    const next = text.replace(/\D/g, '').slice(0, pinCount)
    onChange(next)
  }

  return (
    <Pressable
      style={[styles.row, containerStyle]}
      onPress={() => inputRef.current?.focus()}
      accessibilityRole="none"
    >
      {Array.from({ length: pinCount }, (_, index) => {
        const char = digits[index] ?? ''
        const isActive = index === focusedIndex
        return (
          <View
            key={index}
            style={[
              styles.cell,
              fieldStyle as ViewStyle,
              isActive ? (highlightStyle as ViewStyle) : null,
            ]}
          >
            <Text style={[styles.cellText, fieldStyle]}>{char}</Text>
          </View>
        )
      })}
      <InputComponent
        // gorhom types Ref<TextInput | undefined>; RN refs are TextInput | null.
        ref={inputRef as never}
        value={digits}
        onChangeText={handleChange}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={pinCount}
        caretHidden
        editable={editable}
        style={styles.hiddenInput}
        importantForAutofill="yes"
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    position: 'relative',
  },
  cell: {
    width: 45,
    height: 45,
    borderColor: 'rgba(226, 226, 226, 1)',
    borderWidth: 1,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: {
    textAlign: 'center',
    fontSize: 18,
    color: '#111',
  },
  // Keep a tiny opacity — opacity:0 can block focus/keyboard on some Android builds.
  hiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.01,
    color: 'transparent',
    fontSize: 1,
  },
})
