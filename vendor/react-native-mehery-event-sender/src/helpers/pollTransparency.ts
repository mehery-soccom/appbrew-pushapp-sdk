import type { ViewStyle } from 'react-native';

export function isTransparentPollBackground(color: string): boolean {
  return color.trim().toLowerCase() === 'transparent';
}

export function getPollWebViewProps(backgroundColor: string): {
  opaque: boolean;
  androidLayerType: 'software' | 'hardware';
} {
  const isTransparent = isTransparentPollBackground(backgroundColor);
  return {
    opaque: !isTransparent,
    androidLayerType: isTransparent ? 'software' : 'hardware',
  };
}

export function getTransparentContainerStyle(
  backgroundColor: string
): ViewStyle | null {
  if (!isTransparentPollBackground(backgroundColor)) {
    return null;
  }

  return {
    elevation: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  };
}
