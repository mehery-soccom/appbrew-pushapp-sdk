import * as React from 'react'
import Svg, { Path, SvgProps } from 'react-native-svg'

function VolumeOn(props: SvgProps) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" {...props}>
      <Path
        d="M11 7.08a1 1 0 00-1.625-.78L6.274 8.78a1 1 0 01-.625.22H3a1 1 0 00-1 1v4a1 1 0 001 1h2.65a1 1 0 01.624.22l3.101 2.48A1 1 0 0011 16.92V7.08zM19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"
        stroke={props.stroke ?? '#000'}
        strokeWidth={props.strokeWidth ?? 1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export default VolumeOn
