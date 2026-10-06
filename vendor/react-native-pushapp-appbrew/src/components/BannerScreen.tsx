import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { getDeviceId } from '../utils/device';
import { CustomBanner } from './CustomBanner';
import { sdkLog } from '../helpers/sdkLogger';

type BannerProps = {
  backgroundColor: string;
  headerText: string;
  subText: string;
  name?: string;
};

export const BannerScreen: React.FC = () => {
  const [bannerData, setBannerData] = useState<BannerProps | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDeviceId().then((id) => sdkLog.log('✅ Device ID:', id));
  }, []);

  useEffect(() => {
    fetch('https://templatemaker-2.onrender.com/api/banner')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const latest = data.sort((a, b) => b.index - a.index)[0];
          setBannerData({
            backgroundColor: latest.backgroundColor,
            headerText: latest.titleText,
            subText: latest.subText,
            name: latest.name,
          });
        }
      })
      .catch((err) => sdkLog.error('Failed to fetch banner:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ActivityIndicator size="large" style={styles.loader} />;
  if (!bannerData) return <Text style={styles.emptyText}>No Banner Found</Text>;

  return <CustomBanner {...bannerData} />;
};

const styles = {
  loader: {
    marginTop: 50,
  },
  emptyText: {
    textAlign: 'center' as const,
    marginTop: 50,
  },
};
