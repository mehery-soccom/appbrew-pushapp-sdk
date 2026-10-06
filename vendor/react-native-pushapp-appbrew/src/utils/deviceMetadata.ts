let deviceMetadata: Record<string, string> = {};

export function setDeviceMetadata(metadata: Record<string, string>) {
  deviceMetadata = {
    ...deviceMetadata,
    ...metadata,
  };
}

export function getDeviceMetadata() {
  return deviceMetadata;
}
