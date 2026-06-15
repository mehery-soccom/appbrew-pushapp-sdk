import * as React from 'react'
import Svg, { Path, SvgProps } from 'react-native-svg'

function Return(props: SvgProps) {
  return (
    <Svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      {...props}
    >
      <Path
        d="M17 2l4 4m0 0l-4 4m4-4H7.8c-1.68 0-2.52 0-3.162.327a3 3 0 00-1.311 1.311C3 8.28 3 9.12 3 10.8v.2m0 7h13.2c1.68 0 2.52 0 3.162-.327a3 3 0 001.311-1.311C21 15.72 21 14.88 21 13.2V13M3 18l4 4m-4-4l4-4"
        stroke="#000"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export default Return
