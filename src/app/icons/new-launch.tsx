import * as React from 'react'
import Svg, { Path, SvgProps } from 'react-native-svg'

function NewLaunch(props: SvgProps) {
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
        d="M22 7l-7.869 7.869c-.396.396-.594.594-.822.668a1 1 0 01-.618 0c-.228-.074-.426-.272-.822-.668L9.13 12.13c-.396-.396-.594-.594-.822-.668a1 1 0 00-.618 0c-.228.074-.426.272-.822.668L2 17M22 7h-7m7 0v7"
        stroke="#000"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export default NewLaunch
