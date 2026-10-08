import React from 'react'
import { MeheryPollOverlay } from './MeheryPollOverlay'
import { MeheryPageOpenListener } from './MeheryPageOpenListener'

/** Render once inside your app tree: starts PushApp, mounts polls, reports page opens. */
export function PushAppRoot() {
  return (
    <>
      <MeheryPollOverlay />
      <MeheryPageOpenListener />
    </>
  )
}
