type Coordinate = [number, number];

/** Round display corners locally without moving the underlying district boundary. */
export function roundedBoundaryRing(ring: Coordinate[], radiusMetres = 45): Coordinate[] {
  const points = ring.slice(0, -1);
  if (points.length < 3) return ring;
  const result: Coordinate[] = [];
  const interpolate = (a: Coordinate, b: Coordinate, t: number): Coordinate =>
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  points.forEach((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    const distance = (other: Coordinate) => Math.hypot(
      (other[0] - point[0]) * 111320 * Math.cos(point[1] * Math.PI / 180),
      (other[1] - point[1]) * 111320,
    );
    const incoming = distance(previous), outgoing = distance(next);
    const radius = Math.min(radiusMetres, incoming / 4, outgoing / 4);
    if (radius < 1) {
      result.push(point);
      return;
    }
    const start = interpolate(point, previous, radius / incoming);
    const end = interpolate(point, next, radius / outgoing);
    for (let step = 0; step <= 4; step++) {
      const t = step / 4;
      result.push(interpolate(interpolate(start, point, t), interpolate(point, end, t), t));
    }
  });
  return [...result, result[0]];
}
