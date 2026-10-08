import React, { useCallback, useEffect, useState } from 'react'
import {
  useBlockSettings,
  useBlockStyle,
} from '@gauntlet/components/style-utils'
import { useBlock, useBlockTestID, useLink, useUser } from '@gauntlet/state'
import { BaseBlockProps } from '@gauntlet/types'
import { View } from 'react-native'
import { Text } from '@gauntlet/components/atoms/text'
import { Avatar } from '@gauntlet/components/molecules/avatar'
import { Button } from '@gauntlet/ui-builder'
import { loadMeherySdk } from './sdk'
import { startMehery } from './startMehery'
import {
  accountInlinePlaceholderId,
  accountTooltipPlaceholderId,
} from './accountPollConstants'
import { peekPushAppConfig } from './config'

export {
  ACCOUNT_PAGE_NAME,
  accountInlinePlaceholderId,
  accountTooltipPlaceholderId,
  accountTooltipPlaceholderIds,
} from './accountPollConstants'

export type MeheryProfileUserGreetingProps = BaseBlockProps

type PollComponents = {
  InlinePollContainer: React.ComponentType<{ placeholderId: string }>
  TooltipPollContainer: React.ComponentType<{
    placeholderId: string
    children: React.ReactNode
    tooltipTop?: number
    tooltipLeft?: number
  }>
}

// Module cache: remounts get containers synchronously (no tree swap / flash).
let cachedPolls: PollComponents | null = null

function useMeheryPollComponents(): PollComponents | null {
  const [polls, setPolls] = useState<PollComponents | null>(cachedPolls)

  useEffect(() => {
    if (cachedPolls) return
    let cancelled = false
    void startMehery()
      .then(() => loadMeherySdk())
      .then((sdk) => {
        if (cancelled) return
        const Inline = sdk.InlinePollContainer
        const Tooltip = sdk.TooltipPollContainer
        if (Inline && Tooltip) {
          cachedPolls = {
            InlinePollContainer: Inline,
            TooltipPollContainer: Tooltip,
          }
          setPolls(cachedPolls)
        } else {
          console.warn('[Mehery] Inline/Tooltip poll containers missing')
        }
      })
      .catch((e) => {
        console.warn('[Mehery] poll containers load failed', e)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return polls
}

/**
 * Host override of CMS `profile-user-greeting`:
 * - TooltipPollContainer wraps Edit Profile (single mount; empty compare fans out here)
 * - InlinePollContainer under Edit Profile (above Order History menu block)
 * OnPageOpen('account') is owned by MeheryPageOpenListener (route focus).
 */
export function MeheryProfileUserGreeting({
  componentId,
  instanceId,
  screenId,
}: MeheryProfileUserGreetingProps) {
  const AccountExtras = peekPushAppConfig()?.accountExtras
  const block = useBlock<any>(screenId, componentId, instanceId)
  const testID = useBlockTestID(block, screenId)

  const style = useBlockStyle(block)
  const { source, options } = useBlockSettings(block)

  const {
    data: { userDetails },
    isUserAuthenticated,
  } = useUser()
  const { gotoLink } = useLink()
  const hideAvatar = options?.hideAvatar
  const { displayName: name, email, phone } = (userDetails as any)?.data || {}
  const polls = useMeheryPollComponents()

  const getGreetings = useCallback(
    (input: string) => {
      if (!input) return

      const firstName = name?.split(' ')[0] || ''
      const middleName = name?.split(' ')?.slice(1, -1)?.join(' ') || ''
      const lastName = name?.split(' ')?.slice(-1)?.join(' ') || ''

      return input
        .replace(/{{name}}/g, name || '')
        .replace(/{{firstName}}/g, firstName)
        .replace(/{{middleName}}/g, middleName)
        .replace(/{{lastName}}/g, lastName)
        .replace(/{{email}}/g, email || '')
        .replace(/{{phone}}/g, phone || '')
    },
    [email, name, phone]
  )

  if (!isUserAuthenticated()) {
    return (
      <View style={{ paddingHorizontal: 16 }} testID={testID}>
        {AccountExtras ? <AccountExtras /> : null}
      </View>
    )
  }

  const initials = name?.split(' ')[0] ?? email

  const editButton = options?.showEdit ? (
    <Button
      onPress={() => {
        gotoLink({
          kind: 'screen',
          value: source?.editProfilePage || 'edit-profile',
        })
      }}
      text={source?.editProfileButtonText || 'Edit Profile'}
      style={{
        kind: 'secondary',
        ...style?.editProfileButton,
        root: {
          marginTop: 12,
          ...style?.editProfileButton?.root,
        },
      }}
    />
  ) : null

  const Tooltip = polls?.TooltipPollContainer
  const Inline = polls?.InlinePollContainer

  const editWithTooltip =
    Tooltip && editButton ? (
      <View
        style={{
          zIndex: 20,
          elevation: 20,
          overflow: 'visible',
        }}
        pointerEvents="box-none"
      >
        <Tooltip
          placeholderId={accountTooltipPlaceholderId()}
          tooltipTop={-110}
          tooltipLeft={16}
        >
          {editButton}
        </Tooltip>
      </View>
    ) : (
      editButton
    )

  return (
    <View style={style?.container} testID={testID}>
      {!hideAvatar && Boolean(initials) && (
        <Avatar
          source={{
            initials,
          }}
          style={{
            icon: {
              borderRadius: 50,
              alignItems: 'center',
              justifyContent: 'center',
              width: 60,
              height: 60,
              backgroundColor: '#000000',
              ...style.initials?.root,
            },
            text: {
              color: '#ffffff',
              textTransform: 'uppercase',
              fontSize: 22,
              fontWeight: '500',
              letterSpacing: 2,
              ...style.initials?.text,
            },
          }}
          options={options}
        />
      )}
      <View style={[style?.textContainer, { overflow: 'visible' as const }]}>
        <Text style={style?.greeting}>{getGreetings(source.greeting)}</Text>
        <Text
          style={style.greetingSubText}
          {...options.greeting?.subTitle?.text}
        >
          {getGreetings(source.greetingSubText)}
        </Text>
        {editWithTooltip}
        {Inline ? (
          <Inline placeholderId={accountInlinePlaceholderId()} />
        ) : null}
        {AccountExtras ? <AccountExtras /> : null}
      </View>
    </View>
  )
}
