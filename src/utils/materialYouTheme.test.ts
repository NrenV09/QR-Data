import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MATERIAL_CONFIG,
  hexToRgb,
  rgbToHsl,
  resolveMaterialYouTokens,
} from './materialYouTheme';

test('hexToRgb and rgbToHsl accurately convert hex seed colors', () => {
  const rgb = hexToRgb('#4285F4');
  assert.equal(rgb.r, 66);
  assert.equal(rgb.g, 133);
  assert.equal(rgb.b, 244);

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  assert.ok(hsl.h >= 210 && hsl.h <= 225);
  assert.ok(hsl.s >= 80);
});

test('resolveMaterialYouTokens generates distinct tokens for dark, light, and amoled modes', () => {
  const darkTokens = resolveMaterialYouTokens({
    ...DEFAULT_MATERIAL_CONFIG,
    mode: 'dark',
    shapeScale: 'expressive',
  });
  assert.equal(darkTokens.radiusLg, '28px');

  const lightTokens = resolveMaterialYouTokens({
    ...DEFAULT_MATERIAL_CONFIG,
    mode: 'light',
    shapeScale: 'standard',
  });
  assert.equal(lightTokens.radiusLg, '20px');
  assert.equal(lightTokens.onPrimary, '#FFFFFF');
  assert.notEqual(darkTokens.surface, lightTokens.surface);

  const amoledTokens = resolveMaterialYouTokens({
    ...DEFAULT_MATERIAL_CONFIG,
    mode: 'amoled',
    shapeScale: 'compact',
  });
  assert.equal(amoledTokens.surface, '#000000');
  assert.equal(amoledTokens.radiusLg, '12px');
});

test('resolveMaterialYouTokens honors custom hex seed colors', () => {
  const customTokens = resolveMaterialYouTokens({
    ...DEFAULT_MATERIAL_CONFIG,
    seedId: 'custom',
    customHex: '#10B981',
  });
  assert.equal(customTokens.seedHex, '#10B981');
});
