import React, { useState, useEffect } from 'react';
import { sdkLog } from '../helpers/sdkLogger';
import {
  Modal,
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { onPollDismissed } from '../events/custom/CustomEvents';

let showOverlayFn: ((element: React.ReactNode) => void) | null = null;
let hideOverlayFn: (() => void) | null = null;
let overlayQueue: React.ReactNode[] = [];

const { width, height } = Dimensions.get('window');
const POLL_DISMISS_DELAY_MS = 300;

export const PollOverlayProvider: React.FC = () => {
  const [modalContent, setModalContent] = useState<React.ReactNode | null>(
    null
  );
  const [modalVisible, setModalVisible] = useState(false);
  const [isFloater, setIsFloater] = useState(false);

  const [bannerContents, setBannerContents] = useState<React.ReactNode[]>([]);
  const [pipContents, setPipContents] = useState<React.ReactNode[]>([]);
  const [bottomSheetContents, setBottomSheetContents] = useState<
    React.ReactNode[]
  >([]);

  const dismissModalOverlay = () => {
    setModalVisible(false);
    setModalContent(null);
    setIsFloater(false);
    setTimeout(() => onPollDismissed(), POLL_DISMISS_DELAY_MS);
  };

  showOverlayFn = (element: React.ReactNode) => {
    const pollType = (element as any)?.props?.pollType;
    sdkLog.log('Displaying poll type:', pollType);

    if (pollType && pollType.includes('roadblock')) {
      const cloned = React.cloneElement(element as React.ReactElement<any>, {
        onClose: dismissModalOverlay,
      });

      setModalContent(cloned);
      setIsFloater(false);
      setModalVisible(true);
    } else if (pollType.includes('banner')) {
      const cloned = React.cloneElement(element as React.ReactElement<any>, {
        onClose: () => {
          setBannerContents([]);
          onPollDismissed();
        },
        key: Date.now(), // forces WebView reload
      });

      setBannerContents([cloned]);

      // Replace any existing banner
    } else if (pollType.includes('picture-in-picture')) {
      const alignment = (element as any).props?.alignment || 'center-center';
      const cloned = React.cloneElement(element as React.ReactElement<any>, {
        alignment,
        onClose: () => {
          setPipContents([]);
          onPollDismissed();
        },
      });

      setPipContents([cloned]);
    } else if (pollType.includes('floater')) {
      const cloned = React.cloneElement(element as React.ReactElement<any>, {
        onClose: dismissModalOverlay,
      });
      // ✅ Floater UI — fullscreen without cross button
      setModalContent(cloned);
      setIsFloater(true);
      setModalVisible(true);
    } else if (pollType.includes('bottomsheet')) {
      const originalOnClose = (element as any)?.props?.onClose;
      const cloned = React.cloneElement(element as React.ReactElement<any>, {
        onClose: () => {
          if (typeof originalOnClose === 'function') {
            originalOnClose();
          }
          setBottomSheetContents([]);
          onPollDismissed();
        },
      });
      setBottomSheetContents([cloned]);
    } else {
      sdkLog.warn('Unknown poll type', pollType);
    }
  };
  hideOverlayFn = dismissModalOverlay;

  const handleRoadblock = () => {
    dismissModalOverlay();
  };

  useEffect(() => {
    overlayQueue.forEach((el) => showOverlayFn?.(el));
    overlayQueue = [];
  }, []);

  return (
    <>
      {/* ✅ Shared modal for roadblock and floater — keep mounted to avoid RN Modal remount bugs */}
      <Modal
        visible={modalVisible && !!modalContent}
        transparent
        animationType="fade"
      >
        {modalContent ? (
          <View style={styles.modalContainer}>
            {/* ❌ Only show close button if NOT floater */}
            {!isFloater && (
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={handleRoadblock}
              >
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            )}
            {modalContent}
          </View>
        ) : null}
      </Modal>

      {/* Banner */}
      {bannerContents.map((content, index) => (
        <View
          key={index}
          style={[styles.bannerContainer, { zIndex: 10 + index }]}
          pointerEvents="box-none"
        >
          {content}
        </View>
      ))}
      {/* PIP */}
      {pipContents.map((content, index) => {
        const isFullScreen = (content as any)?.props?.fullscreen;
        return isFullScreen ? (
          <View
            key={index}
            style={[{ zIndex: 9999 + index, width: width, height: height }]}
          >
            {content}
          </View>
        ) : (
          <React.Fragment key={index}>{content}</React.Fragment>
        );
      })}

      {/* BottomSheet */}
      {/* BottomSheet */}
      {bottomSheetContents.map((content, i) => (
        <View key={i} style={[styles.bottomSheetContainer, { zIndex: 15 + i }]}>
          {content}
        </View>
      ))}
    </>
  );
};

// External API
export const showPollOverlay = (element: React.ReactNode) => {
  if (showOverlayFn) showOverlayFn(element);
  else overlayQueue.push(element);
};

export const hidePollOverlay = () => {
  if (hideOverlayFn) hideOverlayFn();
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingVertical: 45,
  },
  bannerContainer: {
    position: 'absolute',
    top: 0,
    width: '100%',
    zIndex: 9999,
    elevation: 9999,
  },
  pipContainer: {
    position: 'absolute',
    width: '33%',
    height: '33%',
    bottom: 10,
    right: 10,
    elevation: 3,
  },
  bottomSheetContainer: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    elevation: 0,
  },
  closeBtn: {
    position: 'absolute',
    top: 80,
    right: 30,
    zIndex: 20000,
    backgroundColor: '#fff',
    borderRadius: 25,
    paddingHorizontal: 7,
    padding: 5,
    elevation: 3,
  },
  closeText: { fontSize: 18, fontWeight: 'bold' },
});
