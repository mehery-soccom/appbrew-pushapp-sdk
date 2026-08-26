import { requireNativeComponent, UIManager, Platform } from 'react-native';
import type { ViewStyle } from 'react-native';

const ComponentName = 'MeheryEventSenderView';

type MeheryEventSenderProps = {
  color: string;
  style: ViewStyle;
};

const LINKING_ERROR =
  `The package 'react-native-mehery-event-sender' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

export const MeheryEventSenderView =
  UIManager.getViewManagerConfig(ComponentName) != null
    ? requireNativeComponent<MeheryEventSenderProps>(ComponentName)
    : () => {
        throw new Error(LINKING_ERROR);
      };
