import * as React from 'react'
import Svg, { Path, SvgProps } from 'react-native-svg'

function EasyReturn(props: SvgProps) {
  return (
    <Svg
      xmlns="http://www.w3.org/2000/svg"
      width={25}
      height={24}
      viewBox="0 0 25 24"
      fill="none"
      {...props}
    >
      <Path
        d="M17.5 18.874a8.5 8.5 0 00-5-15.375H12m.5 17a8.5 8.5 0 01-5-15.374m4 17.275l2-2-2-2m2-12.8l-2-2 2-2"
        stroke="#000"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export default EasyReturn
