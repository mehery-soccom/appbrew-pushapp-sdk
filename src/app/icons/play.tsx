import * as React from 'react'
import Svg, { Path, SvgProps } from 'react-native-svg'

export function SvgComponent(props: SvgProps) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" {...props}>
      <Path
        d="M6 6.663c0-1.582 1.75-2.538 3.082-1.682l8.301 5.337a2 2 0 010 3.364L9.082 19.02C7.75 19.875 6 18.919 6 17.337V6.663z"
        fill={props.fill ?? '#fff'}
        stroke={props.stroke ?? '#fff'}
        strokeWidth={props.strokeWidth ?? 1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export default SvgComponent
