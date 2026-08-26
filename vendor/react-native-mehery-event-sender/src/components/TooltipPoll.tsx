import { useState, useEffect, useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import type { ViewStyle, TextStyle, DimensionValue } from 'react-native';

function decodeHtmlEntity(entity: string) {
  if (!entity) return '';
  return entity.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code));
}

interface TooltipPollProps {
  line1?: string;
  line2?: string;
  line1Icon?: string;
  line1IconPosition?: 'prepend' | 'append';
  line1Color?: string;
  line2Color?: string;
  line1FontSize?: number;
  line2FontSize?: number;
  line1TextStyles?: TextStyle[];
  line2TextStyles?: TextStyle[];
  line1FontTextStyles?: TextStyle[];
  line2FontTextStyles?: TextStyle[];
  tooltipKey?: string;
  width?: DimensionValue;
  bgColor?: string;
  top?: number;
  left?: number;
  align?: 'left' | 'center' | 'right';
  zIndex?: number;
  borderRadius?: number;
  elevation?: number;
  notificationUrl?: string;
  onPress?: () => void;
}

export default function TooltipPoll({
  line1 = '',
  line2 = '',
  line1Icon,
  line1IconPosition = 'prepend',
  line1Color,
  line2Color,
  line1FontSize,
  line2FontSize,
  line1TextStyles = [],
  line2TextStyles = [],
  line1FontTextStyles = [],
  line2FontTextStyles = [],
  tooltipKey,
  width = 150,
  bgColor = 'transparent',
  top = 50,
  left = -140,
  align = 'center',
  zIndex = 450,
  borderRadius = 8,
  elevation = 3,
  notificationUrl,
  onPress,
}: TooltipPollProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (tooltipKey) setVisible(true);
  }, [tooltipKey]);

  const containerStyle = useMemo<ViewStyle>(
    () => ({
      backgroundColor: bgColor,
      padding: 8,
      borderRadius,
      position: 'absolute',
      top,
      left,
      minWidth: width,
      zIndex,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 4,
      elevation,
      alignItems:
        align === 'left'
          ? 'flex-start'
          : align === 'right'
            ? 'flex-end'
            : 'center',
    }),
    [bgColor, top, left, width, zIndex, borderRadius, elevation, align]
  );

  const line1Style = useMemo<TextStyle>(
    () => ({
      color: line1Color || 'white',
      fontSize: line1FontSize || 14,
      fontWeight: 'bold',
      ...Object.assign({}, ...line1TextStyles),
      ...Object.assign({}, ...line1FontTextStyles),
    }),
    [line1Color, line1FontSize, line1TextStyles, line1FontTextStyles]
  );

  const line2Style = useMemo<TextStyle>(
    () => ({
      color: line2Color || 'gray',
      fontSize: line2FontSize || 12,
      marginTop: 4,
      ...Object.assign({}, ...line2TextStyles),
      ...Object.assign({}, ...line2FontTextStyles),
    }),
    [line2Color, line2FontSize, line2TextStyles, line2FontTextStyles]
  );

  if (!visible) return null;

  const content = (
    <>
      <Text style={line1Style}>
        {line1Icon && line1IconPosition === 'prepend'
          ? `${decodeHtmlEntity(line1Icon)} `
          : ''}
        {line1}
        {line1Icon && line1IconPosition === 'append'
          ? ` ${decodeHtmlEntity(line1Icon)}`
          : ''}
      </Text>
      {line2 ? <Text style={line2Style}>{line2}</Text> : null}
    </>
  );

  if (notificationUrl && onPress) {
    return (
      <Pressable
        style={({ pressed }) => [containerStyle, pressed && { opacity: 0.7 }]}
        onPress={onPress}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={containerStyle}>{content}</View>;
}
