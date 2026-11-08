import { exec } from 'child_process';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

const REQUIRED_ASSETS = [
  'icon.svg',
  'apple-touch-icon.png',
  'pwa-192x192.png',
  'pwa-512x512.png',
  'pwa-maskable-512x512.png',
];

function ensureMainFolderAssets(): string[] {
  const publicDir = path.join(__dirname, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  const verified: string[] = [];
  for (const asset of REQUIRED_ASSETS) {
    const mainPath = path.join(__dirname, asset);
    const pubPath = path.join(publicDir, asset);
    if (fs.existsSync(mainPath) && !fs.existsSync(pubPath)) {
      fs.copyFileSync(mainPath, pubPath);
    } else if (fs.existsSync(pubPath) && !fs.existsSync(mainPath)) {
      fs.copyFileSync(pubPath, mainPath);
    }
    if (fs.existsSync(mainPath)) {
      verified.push(asset);
    }
  }
  return verified;
}

let activeBuildPromise: Promise<{
  html: string;
  buildOutput: string;
  buildDurationMs: number;
  assetsVerified: string[];
}> | null = null;

async function runViteSingleFileBuild(): Promise<{
  html: string;
  buildOutput: string;
  buildDurationMs: number;
  assetsVerified: string[];
}> {
  if (activeBuildPromise) {
    return activeBuildPromise;
  }

  activeBuildPromise = (async () => {
    try {
      const started = Date.now();
      const assetsVerified = ensureMainFolderAssets();
      const { stdout, stderr } = await execAsync('npm run build', {
        cwd: __dirname,
        env: { ...process.env, NODE_ENV: 'production' },
      });

      const standalonePath = path.join(
        __dirname,
        'dist',
        'optilink-standalone.html'
      );
      const distIndexPath = path.join(__dirname, 'dist', 'index.html');
      const targetPath = fs.existsSync(standalonePath)
        ? standalonePath
        : distIndexPath;

      const html = fs.readFileSync(targetPath, 'utf-8');
      const buildDurationMs = Date.now() - started;
      const buildOutput = [stdout.trim(), stderr.trim()]
        .filter(Boolean)
        .join('\n');

      return {
        html,
        buildOutput,
        buildDurationMs,
        assetsVerified,
      };
    } finally {
      activeBuildPromise = null;
    }
  })();

  return activeBuildPromise;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  ensureMainFolderAssets();

  // GET /api/standalone-html -> returns existing compiled single-file HTML or runs npm run build if not yet built
  app.get('/api/standalone-html', async (_req, res) => {
    try {
      const assetsVerified = ensureMainFolderAssets();
      const standalonePath = path.join(
        __dirname,
        'dist',
        'optilink-standalone.html'
      );
      const publicStandalonePath = path.join(
        __dirname,
        'public',
        'optilink-standalone.html'
      );

      if (fs.existsSync(standalonePath)) {
        const html = fs.readFileSync(standalonePath, 'utf-8');
        res.json({
          ok: true,
          html,
          sizeBytes: Buffer.byteLength(html, 'utf-8'),
          buildDurationMs: 0,
          buildOutput: [
            '> Cached output from `npm run build` (dist/optilink-standalone.html)',
            `✓ Main folder assets verified: ${assetsVerified.join(', ')}`,
            `✓ Single-file offline bundle size: ${(
              Buffer.byteLength(html, 'utf-8') / 1024
            ).toFixed(1)} KB`,
          ].join('\n'),
          assetsVerified,
        });
        return;
      }

      if (fs.existsSync(publicStandalonePath)) {
        const html = fs.readFileSync(publicStandalonePath, 'utf-8');
        res.json({
          ok: true,
          html,
          sizeBytes: Buffer.byteLength(html, 'utf-8'),
          buildDurationMs: 0,
          buildOutput: [
            '> Prebuilt output from `npm run build` (public/optilink-standalone.html)',
            `✓ Main folder assets verified: ${assetsVerified.join(', ')}`,
            `✓ Single-file offline bundle size: ${(
              Buffer.byteLength(html, 'utf-8') / 1024
            ).toFixed(1)} KB`,
          ].join('\n'),
          assetsVerified,
        });
        return;
      }

      const result = await runViteSingleFileBuild();
      res.json({
        ok: true,
        html: result.html,
        sizeBytes: Buffer.byteLength(result.html, 'utf-8'),
        buildDurationMs: result.buildDurationMs,
        buildOutput: result.buildOutput,
        assetsVerified: result.assetsVerified,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // POST /api/build-single-file -> executes a fresh `npm run build` with vite.config.ts
  app.post('/api/build-single-file', async (_req, res) => {
    try {
      const result = await runViteSingleFileBuild();
      res.json({
        ok: true,
        html: result.html,
        sizeBytes: Buffer.byteLength(result.html, 'utf-8'),
        buildDurationMs: result.buildDurationMs,
        buildOutput: result.buildOutput,
        assetsVerified: result.assetsVerified,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // Serve compiled standalone single-file HTML directly
  app.get('/optilink-standalone.html', async (_req, res) => {
    const standalonePath = path.join(
      __dirname,
      'dist',
      'optilink-standalone.html'
    );
    if (!fs.existsSync(standalonePath)) {
      await runViteSingleFileBuild();
    }
    res.type('html').sendFile(standalonePath);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`OptiLink ARQ Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
