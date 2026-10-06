function isFullyTransparentColor(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  const rgbaMatch = normalized.match(
    /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*([\d.]+)\s*)?\)$/
  );
  if (rgbaMatch) {
    const alpha = rgbaMatch[1] !== undefined ? parseFloat(rgbaMatch[1]) : 1;
    return alpha === 0;
  }

  const hslaMatch = normalized.match(
    /^hsla?\(\s*[\d.]+\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*(?:,\s*([\d.]+)\s*)?\)$/
  );
  if (hslaMatch) {
    const alpha = hslaMatch[1] !== undefined ? parseFloat(hslaMatch[1]) : 1;
    return alpha === 0;
  }

  if (/^#[0-9a-f]{8}$/.test(normalized)) {
    return normalized.slice(-2) === '00';
  }

  if (/^#[0-9a-f]{4}$/.test(normalized)) {
    return normalized.slice(-1) === '0';
  }

  return false;
}

export function resolvePollBackgroundColor(bgColor?: string | null): string {
  const value = (bgColor ?? '').trim().toLowerCase();
  if (!value || value === 'transparent' || value === 'none') {
    return 'transparent';
  }
  if (value === 'rgba(0,0,0,0)' || value === '#00000000') {
    return 'transparent';
  }
  if (isFullyTransparentColor(value)) {
    return 'transparent';
  }
  return bgColor!.trim();
}
