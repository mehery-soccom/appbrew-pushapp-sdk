import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildCommonHeaders } from '../helpers/buildCommonHeaders';
import { getApiBaseUrl } from '../helpers/tenantContext';
import { sdkLog } from '../helpers/sdkLogger';

export async function updatePushToken(newToken: string): Promise<void> {
  if (!newToken) return;

  const [storedToken, contactId, channelId] = await AsyncStorage.multiGet([
    'lastRegisteredToken',
    'contact_id',
    'mehery_channel_id',
  ]).then((e) => e.map(([_, v]) => v ?? ''));

  sdkLog.log('[TokenUpdate] Previous token:', storedToken || '(none)');
  sdkLog.log('[TokenUpdate] New token:', newToken);

  if (newToken === storedToken) {
    sdkLog.log('[TokenUpdate] Token unchanged, skipping update');
    return;
  }
  if (!contactId) {
    sdkLog.log('[TokenUpdate] No contact_id yet, skipping update');
    return;
  }

  const apiBaseUrl = await getApiBaseUrl();
  const headers = await buildCommonHeaders();

  try {
    const res = await fetch(`${apiBaseUrl}/update/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        contact_id: contactId,
        token: newToken,
        channel_id: channelId,
      }),
    });
    if (res.ok) {
      await AsyncStorage.setItem('lastRegisteredToken', newToken);
      sdkLog.log('[TokenUpdate] Updated token on server');
    } else {
      sdkLog.warn('[TokenUpdate] Server returned', res.status);
    }
  } catch (err) {
    sdkLog.warn('[TokenUpdate] Failed:', err);
  }
}
