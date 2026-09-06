/** Keep the drawing buffer bounded independently of a device's pixel density. */
export function drawingSize(width, height, pixelRatio, compact, quality = 1) {
  const budget = (compact ? 460_000 : 3_200_000) * quality;
  const scale = Math.min(pixelRatio, compact ? 1.2 : 2, Math.sqrt(budget / (width * height)));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Keep the planet and nearby subjects inside portrait as well as landscape camera frustums. */
export function sceneLayout(width, height, compact) {
  const aspect = width / height;
  const fov = compact ? 56 : 50;
  const halfHeight = Math.tan(fov * Math.PI / 360);
  const planetHalfWidth = 1072 * halfHeight * aspect;
  const foregroundHalfWidth = 23 * halfHeight * aspect;
  return {
    fov,
    planetX: Math.min(290, planetHalfWidth * (compact ? 0.23 : 0.5), Math.max(0, planetHalfWidth - 178)),
    shipX: Math.min(compact ? 1.5 : 16, 65 * halfHeight * aspect * 0.35),
    mantaX: Math.min(compact ? 0.6 : 7, foregroundHalfWidth * 0.3),
    mantaTravel: Math.min(compact ? 1.3 : 3.4, foregroundHalfWidth * 0.15),
  };
}

/** Match the poster's object-fit: cover, including the mobile focal point. */
export function coverTransform(width, height, imageWidth, imageHeight, compact) {
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const visibleWidth = width / (imageWidth * scale);
  const visibleHeight = height / (imageHeight * scale);
  return [visibleWidth, visibleHeight, (1 - visibleWidth) * (compact ? 0.68 : 0.5), (1 - visibleHeight) * 0.5];
}

/** Reserve image edges for camera travel so pointer movement never exposes an empty border. */
export function cameraTransform(pointer, exploration) {
  const amount = Math.max(0, Math.min(1, exploration));
  const horizontal = Math.max(-1, Math.min(1, pointer[0]));
  const vertical = Math.max(-1, Math.min(1, pointer[1]));
  return [
    0.972 - amount * 0.106,
    horizontal * (0.003 + amount * 0.039),
    vertical * (0.0018 + amount * 0.0262),
  ];
}
