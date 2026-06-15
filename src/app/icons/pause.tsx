import * as React from 'react'
import Svg, { Path, SvgProps } from 'react-native-svg'

function Pause(props: SvgProps) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" {...props}>
      <Path
        d="M8.5 4h-1A1.5 1.5 0 006 5.5v13A1.5 1.5 0 007.5 20h1a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 008.5 4zM16.5 4h-1A1.5 1.5 0 0014 5.5v13a1.5 1.5 0 001.5 1.5h1a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0016.5 4z"
        stroke={props.stroke ?? '#000'}
        strokeWidth={props.strokeWidth ?? 1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export default Pause
