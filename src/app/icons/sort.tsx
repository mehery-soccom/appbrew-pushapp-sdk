import * as React from 'react'
import Svg, { Path } from 'react-native-svg'
import type { SvgProps } from 'react-native-svg'
const Sort = (props: SvgProps) => (
  <Svg width={17} height={16} viewBox="0 0 17 16" fill="none" {...props}>
    <Path
      d="M4.5 8H12.5M2.5 4H14.5M6.5 12H10.5"
      stroke={props.stroke ?? '#0C0B0B'}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
)
export default Sort
