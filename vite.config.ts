import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, Plugin} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

const CORE_ASSET_FILES = [
  'icon.svg',
  'apple-touch-icon.png',
  'pwa-192x192.png',
  'pwa-512x512.png',
  'pwa-maskable-512x512.png',
];

/**
 * Ensures all required icons/assets are present in both the root (main) folder
 * and `public/`, and bundles the Vite build output into a 100% self-contained
 * single-file HTML (`dist/index.html` & `dist/optilink-standalone.html`) that
 * runs completely offline without internet or external files.
 */
function optilinkOfflineSingleFilePlugin(): Plugin {
  const rootDir = path.resolve(__dirname, '.');
  const publicDir = path.resolve(rootDir, 'public');
  const distDir = path.resolve(rootDir, 'dist');

  const syncAssetsBetweenMainAndPublic = () => {
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, {recursive: true});
    }
    for (const file of CORE_ASSET_FILES) {
      const rootFile = path.join(rootDir, file);
      const pubFile = path.join(publicDir, file);
      if (fs.existsSync(rootFile) && !fs.existsSync(pubFile)) {
        fs.copyFileSync(rootFile, pubFile);
      } else if (fs.existsSync(pubFile) && !fs.existsSync(rootFile)) {
        fs.copyFileSync(pubFile, rootFile);
      }
    }
  };

  return {
    name: 'optilink-offline-singlefile',
    enforce: 'post',
    buildStart() {
      syncAssetsBetweenMainAndPublic();
    },
    closeBundle() {
      const indexHtmlPath = path.join(distDir, 'index.html');
      if (!fs.existsSync(indexHtmlPath)) return;

      let html = fs.readFileSync(indexHtmlPath, 'utf-8');

      // 1. Inline all generated <link rel="stylesheet" href="..."> into <style> tags
      html = html.replace(
        /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi,
        (fullMatch, href: string) => {
          const cleanRel = href.replace(/^\.?\//, '');
          const cssPath = path.join(distDir, cleanRel);
          if (fs.existsSync(cssPath)) {
            const cssContent = fs.readFileSync(cssPath, 'utf-8');
            return `<style data-inlined-href="${cleanRel}">\n${cssContent}\n</style>`;
          }
          return fullMatch;
        }
      );

      // 2. Collect all generated <script type="module" ... src="..."></script> and place them right before </body>
      const inlinedScripts: string[] = [];
      html = html.replace(
        /<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi,
        (fullMatch, src: string) => {
          if (src.includes('registerSW.js')) {
            return fullMatch;
          }
          const cleanRel = src.replace(/^\.?\//, '');
          const jsPath = path.join(distDir, cleanRel);
          if (fs.existsSync(jsPath)) {
            const jsContent = fs
              .readFileSync(jsPath, 'utf-8')
              .replace(/<\/script/gi, '<\\/script');
            inlinedScripts.push(
              `<script type="module" data-inlined-src="${cleanRel}">\n${jsContent}\n</script>`
            );
            return '';
          }
          return fullMatch;
        }
      );

      if (inlinedScripts.length > 0) {
        html = html.replace('</body>', () => `${inlinedScripts.join('\n')}\n  </body>`);
      }

      // 3. Inline apple-touch-icon.png as base64 data URI if available in main folder or dist
      const appleIconPath = fs.existsSync(
        path.join(rootDir, 'apple-touch-icon.png')
      )
        ? path.join(rootDir, 'apple-touch-icon.png')
        : path.join(distDir, 'apple-touch-icon.png');

      if (fs.existsSync(appleIconPath)) {
        const b64 = fs.readFileSync(appleIconPath).toString('base64');
        html = html.replace(
          /href=["'][^"']*apple-touch-icon[^"']*\.png["']/g,
          `href="data:image/png;base64,${b64}"`
        );
      }

      // 4. Write the self-contained single-file HTML (safe for file://, USB, AirDrop, Bluetooth, or offline browsers)
      const standaloneHtml = html
        .replace(/<link\b[^>]*rel=["']manifest["'][^>]*\/?>/gi, '')
        .replace(
          /<script\b[^>]*id=["']vite-plugin-pwa:register-sw["'][^>]*><\/script>/gi,
          ''
        )
        .replace(
          /<html lang="en" class="dark">/i,
          '<html lang="en" class="dark" data-standalone-offline="true">'
        );

      fs.writeFileSync(indexHtmlPath, html, 'utf-8');
      fs.writeFileSync(
        path.join(distDir, 'optilink-standalone.html'),
        standaloneHtml,
        'utf-8'
      );
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          id: './',
          name: 'OptiLink ARQ — Optical File Transfer',
          short_name: 'OptiLink',
          description:
            'Offline bidirectional face-to-face mobile file transfer using dynamic QR codes, front-facing cameras, and a Stop-and-Wait Optical ARQ protocol.',
          theme_color: '#0F141C',
          background_color: '#0F141C',
          display: 'standalone',
          start_url: './',
          scope: './',
          icons: [
            {
              src: './pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: './pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: './pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
          navigateFallback: 'index.html',
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
      optilinkOfflineSingleFilePlugin(),
    ],
    build: {
      assetsInlineLimit: 100000000,
      cssCodeSplit: false,
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
