export function elbowAngle(
  shoulder: { x: number; y: number },
  elbow: { x: number; y: number },
  wrist: { x: number; y: number },
): number {
  const ux = shoulder.x - elbow.x;
  const uy = shoulder.y - elbow.y;
  const vx = wrist.x - elbow.x;
  const vy = wrist.y - elbow.y;
  const dot = ux * vx + uy * vy;
  const magU = Math.sqrt(ux * ux + uy * uy);
  const magV = Math.sqrt(vx * vx + vy * vy);
  if (magU === 0 || magV === 0) {
    return 0;
  }
  const cos = Math.max(-1, Math.min(1, dot / (magU * magV)));
  return (Math.acos(cos) * 180) / Math.PI;
}

export function dist2d(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function dist3d(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function elbowAngle3d(
  shoulder: { x: number; y: number; z: number },
  elbow: { x: number; y: number; z: number },
  wrist: { x: number; y: number; z: number },
): number {
  const upper = {
    x: shoulder.x - elbow.x,
    y: shoulder.y - elbow.y,
    z: shoulder.z - elbow.z,
  };
  const forearm = {
    x: wrist.x - elbow.x,
    y: wrist.y - elbow.y,
    z: wrist.z - elbow.z,
  };
  const dot =
    upper.x * forearm.x +
    upper.y * forearm.y +
    upper.z * forearm.z;
  const upperMagnitude = Math.hypot(upper.x, upper.y, upper.z);
  const forearmMagnitude = Math.hypot(
    forearm.x,
    forearm.y,
    forearm.z,
  );
  if (upperMagnitude === 0 || forearmMagnitude === 0) {
    return 0;
  }
  const cosine = Math.max(
    -1,
    Math.min(1, dot / (upperMagnitude * forearmMagnitude)),
  );
  return (Math.acos(cosine) * 180) / Math.PI;
}
