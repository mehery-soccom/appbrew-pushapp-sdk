import * as React from 'react'
import Svg, { Path, SvgProps } from 'react-native-svg'

function VolumeOff(props: SvgProps) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" {...props}>
      <Path
        d="M11 7.08a1 1 0 00-1.625-.78L6.274 8.78a1 1 0 01-.625.22H3a1 1 0 00-1 1v4a1 1 0 001 1h2.65a1 1 0 01.624.22l3.101 2.48A1 1 0 0011 16.92V7.08zM23 9l-6 6M17 9l6 6"
        stroke={props.stroke ?? '#000'}
        strokeWidth={props.strokeWidth ?? 1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export default VolumeOff
