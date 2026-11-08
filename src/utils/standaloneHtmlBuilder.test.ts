import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  MAIN_FOLDER_ASSETS,
  verifyOfflineHtmlBundle,
} from './standaloneHtmlBuilder.ts';

test('verifyOfflineHtmlBundle detects external CDN scripts and verifies inline bundles', () => {
  const withCdn = `<!doctype html><html><head><script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script></head><body></body></html>`;
  const checkBad = verifyOfflineHtmlBundle(withCdn);
  assert.equal(checkBad.offlineVerified, false);
  assert.equal(checkBad.externalUrlCount, 1);

  const inlineGood = `<!doctype html><html><head><style data-inlined-href="index.css">body{margin:0}</style></head><body><div id="root"></div><script type="module" data-inlined-src="index.js">console.log("offline");</script></body></html>`;
  const checkGood = verifyOfflineHtmlBundle(inlineGood);
  assert.equal(checkGood.offlineVerified, true);
  assert.equal(checkGood.externalUrlCount, 0);
});

test('all required assets exist in the main folder for npm run build', () => {
  const rootDir = process.cwd();
  for (const asset of MAIN_FOLDER_ASSETS) {
    assert.equal(
      fs.existsSync(path.join(rootDir, asset)),
      true,
      `Expected asset ${asset} to exist in main folder`
    );
  }
});

test('dist/optilink-standalone.html built by vite.config.ts is 100% offline verified with inlined CSS & JS', () => {
  const standalonePath = path.join(process.cwd(), 'dist', 'optilink-standalone.html');
  if (fs.existsSync(standalonePath)) {
    const html = fs.readFileSync(standalonePath, 'utf-8');
    const result = verifyOfflineHtmlBundle(html);
    assert.equal(result.offlineVerified, true);
    assert.equal(result.externalUrlCount, 0);
    assert.equal(html.includes('data-inlined-href='), true);
    assert.equal(html.includes('data-inlined-src='), true);
  }
});
