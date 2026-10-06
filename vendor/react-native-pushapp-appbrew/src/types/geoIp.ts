/** Host-supplied geo / IP fields (all optional). */
export type GeoIpInput = {
  ip?: string;
  location?: { lat?: number; lng?: number };
  country?: { iso_code?: string; name?: string };
  region?: { iso_code?: string; name?: string };
  city?: { name?: string };
  area?: { name?: string };
};

/** Normalized shape sent on `/v1/event`, `/device/register`, `/device/link`. */
export type GeoIpPayload = {
  ip: string;
  location: { lat: number; lng: number };
  country: { iso_code: string; name: string };
  region: { iso_code: string; name: string };
  city: { name: string };
  area: { name: string };
};
