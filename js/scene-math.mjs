/** Keep the drawing buffer bounded independently of a device's pixel density. */
export function drawingSize(width, height, pixelRatio, compact, quality = 1) {
  const budget = (compact ? 460_000 : 1_450_000) * quality;
  const scale = Math.min(pixelRatio, compact ? 1.2 : 1.5, Math.sqrt(budget / (width * height)));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
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
    0.986 - amount * 0.106,
    horizontal * (0.003 + amount * 0.039),
    vertical * (0.0018 + amount * 0.0262),
  ];
}
