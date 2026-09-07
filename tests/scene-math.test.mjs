import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraTransform, coverTransform, drawingSize, shipFlightPath } from '../js/scene-math.mjs';

const screens = [[320, 568, 3], [390, 844, 3], [430, 932, 3], [844, 390, 3], [768, 1024, 2], [1280, 720, 1], [1920, 1080, 2], [3840, 2160, 2]];

test('retina and large displays cannot exceed the drawing budget through pixel density', () => {
  for (const [width, height, pixelRatio] of screens) {
    for (const compact of [true, false]) {
      for (const quality of [1, 0.75, 0.5]) {
        const size = drawingSize(width, height, pixelRatio, compact, quality);
        const budget = (compact ? 1_000_000 : 3_200_000) * quality;
        assert.ok(size.width * size.height <= budget + size.width + size.height);
        assert.ok(Math.abs(size.width / size.height - width / height) < 0.01);
        assert.ok(size.width > 0 && size.height > 0);
      }
    }
  }
});

test('quality reduction lowers memory and rendering work without changing composition', () => {
  const full = drawingSize(1920, 1080, 2, false, 1);
  const reduced = drawingSize(1920, 1080, 2, false, 0.5);
  assert.ok(reduced.width * reduced.height < full.width * full.height * 0.51);
  assert.ok(Math.abs(full.width / full.height - reduced.width / reduced.height) < 0.01);
});

test('ship flight path uses the requested page and exploration envelopes', () => {
  for (const [exploration, envelope] of [[0, 0.8], [1, 1.1]]) {
    let maximumX = 0;
    let maximumY = 0;
    for (let index = 0; index <= 720; index += 1) {
      const path = shipFlightPath(index / 720 * Math.PI * 2, exploration);
      maximumX = Math.max(maximumX, Math.abs(path.x));
      maximumY = Math.max(maximumY, Math.abs(path.y));
      assert.equal(path.envelope, envelope);
      assert.ok(Math.abs(path.x) <= envelope + 1e-10);
      assert.ok(Math.abs(path.y) <= envelope + 1e-10);
      assert.ok(path.viewDistance >= 64 && path.viewDistance <= 80);
    }
    assert.ok(maximumX > envelope * 0.7);
    assert.ok(maximumY > envelope * 0.7);
  }
});

test('cover coordinates stay inside the image in portrait, landscape, and ultrawide layouts', () => {
  for (const [width, height] of [...screens, [3440, 1440], [280, 1000]]) {
    const [scaleX, scaleY, offsetX, offsetY] = coverTransform(width, height, 1672, 941, width <= 700);
    assert.ok(scaleX > 0 && scaleY > 0);
    assert.ok(offsetX >= -1e-10 && offsetY >= -1e-10);
    assert.ok(offsetX + scaleX <= 1 + 1e-10 && offsetY + scaleY <= 1 + 1e-10);
    assert.ok(Math.abs(Math.max(scaleX, scaleY) - 1) < 1e-10);
  }
});

test('the planet remains inside the crop on narrow phones', () => {
  for (const [width, height] of screens.filter(([width]) => width <= 430)) {
    const [scaleX, , offsetX] = coverTransform(width, height, 1672, 941, true);
    const planetCenter = 0.70;
    assert.ok(planetCenter > offsetX && planetCenter < offsetX + scaleX);
  }
});

test('camera travel keeps image edges covered throughout the transition into exploration', () => {
  for (const exploration of [0, 0.1, 0.5, 0.9, 1]) {
    for (const pointer of [[-1, -1], [1, 1], [-1, 1], [1, -1], [10, -10]]) {
      const [scale, horizontal, vertical] = cameraTransform(pointer, exploration);
      const margin = (1 - scale) / 2;
      assert.ok(margin - Math.abs(horizontal) > 0.0086, 'Water distortion must fit inside the horizontal overscan.');
      assert.ok(margin - Math.abs(vertical) > 0.0038, 'Water distortion must fit inside the vertical overscan.');
    }
  }
});

test('exploration camera movement is visible while the biography retains a quiet background', () => {
  const page = cameraTransform([1, 1], 0);
  const exploration = cameraTransform([1, 1], 1);
  for (const [width, height] of [[890, 998], [1280, 720], [1920, 1080]]) {
    assert.ok(exploration[1] * width / exploration[0] > 35);
    assert.ok(exploration[2] * height / exploration[0] > 20);
    assert.ok(exploration[1] > page[1] * 10);
  }
  assert.deepEqual(cameraTransform([0, 0], 1).slice(1), [0, 0]);
});
