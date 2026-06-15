import * as React from 'react'
import Svg, { Path, SvgProps } from 'react-native-svg'

function AddressBook(props: SvgProps) {
  return (
    <Svg
      width={props.width ?? 24}
      height={props.height ?? 25}
      viewBox="0 0 24 25"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <Path
        d="M9 18.5l-7 4v-16l7-4m0 16l7 4m-7-4v-16m7 20l6-4v-16l-6 4m0 16v-16m0 0l-7-4"
        stroke="#000"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export default AddressBook
