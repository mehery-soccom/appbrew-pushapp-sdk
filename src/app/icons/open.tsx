import * as React from 'react'
import Svg, { Path, SvgProps } from 'react-native-svg'

function Open(props: SvgProps) {
  return (
    <Svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="white"
      {...props}
    >
      <Path
        d="M18 15l-6-6-6 6"
        stroke="black"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export default Open
