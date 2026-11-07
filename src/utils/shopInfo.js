export function shopNames(settings) {
  const arabic = settings?.shopNameAr?.trim() || settings?.shopName?.trim() || 'طالياني كوافير';
  const french = settings?.shopNameFr?.trim() || 'Taliani Coiffeur';
  return { arabic, french };
}

export function shopCoordinates(settings) {
  const rawLatitude = String(settings?.shopLocationLatitude ?? '').trim();
  const rawLongitude = String(settings?.shopLocationLongitude ?? '').trim();
  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);
  if (
    !rawLatitude ||
    !rawLongitude ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return [latitude, longitude];
}

export function shopMapUrl(settings) {
  const coordinates = shopCoordinates(settings);
  const address = settings?.address?.trim();
  if (!coordinates && !address) return null;
  const query = coordinates ? coordinates.join(',') : address;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
