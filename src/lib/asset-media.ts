export function bearingToBuilding(
  lat: number,
  lng: number,
  targetLat: number,
  targetLng: number,
) {
  const rad = Math.PI / 180;
  const delta = (targetLng - lng) * rad;
  return (
    Math.atan2(
      Math.sin(delta) * Math.cos(targetLat * rad),
      Math.cos(lat * rad) * Math.sin(targetLat * rad) -
        Math.sin(lat * rad) * Math.cos(targetLat * rad) * Math.cos(delta),
    ) / rad
  );
}

export function mediaLayerLeft(mapWidth: number, detailRight: number) {
  const gutter = mapWidth * 0.0125;
  const beside = detailRight + gutter;
  return mapWidth - beside - gutter >= 320 ? beside : gutter;
}
