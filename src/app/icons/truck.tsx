import * as React from 'react'
import Svg, { Path, SvgProps } from 'react-native-svg'

function Truck(props: SvgProps) {
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
        d="M14 7h2.337c.245 0 .367 0 .482.028a1 1 0 01.29.12c.1.061.187.148.36.32l4.062 4.063c.173.173.26.26.322.36.054.09.095.188.12.29.027.115.027.237.027.482V15.5c0 .466 0 .699-.076.883a1 1 0 01-.541.54c-.184.077-.417.077-.883.077m-5 0H14m0 0V7.2c0-1.12 0-1.68-.218-2.108a2 2 0 00-.874-.874C12.48 4 11.92 4 10.8 4H5.2c-1.12 0-1.68 0-2.108.218a2 2 0 00-.874.874C2 5.52 2 6.08 2 7.2V15a2 2 0 002 2m10 0h-4m0 0a3 3 0 11-6 0m6 0a3 3 0 10-6 0m16.5.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
        stroke="#000"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export default Truck

//https://clobug.com/cdn/shop/files/Sheer_Bodycon_With_Shorts_Crop_Top-25.jpg?v=1727178104&width=640
//https://clobug.com/cdn/shop/files/Sheer_Bodycon_With_Shorts_Crop_Top-15.jpg?v=1727177872&width=640
// https://clobug.com/cdn/shop/files/Sheer_Bodycon_With_Shorts_Crop_Top-1.jpg?v=1727177418&width=640
