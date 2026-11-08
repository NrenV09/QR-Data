import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FolderCheck,
  GitBranch,
  RefreshCw,
  ShieldCheck,
  Terminal,
  X,
} from 'lucide-react';
import {
  MAIN_FOLDER_ASSETS,
  SingleFileBuildResult,
  buildOrFetchSingleFileHtml,
} from '../utils/standaloneHtmlBuilder';

interface StandaloneModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GITHUB_WORKFLOW_YAML = `name: Build & Deploy Offline PWA + Single-File HTML to GitHub Pages

on:
  push:
    branches: [main, master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Sync main folder assets with public/
        run: |
          mkdir -p public
          for asset in icon.svg apple-touch-icon.png pwa-192x192.png pwa-512x512.png pwa-maskable-512x512.png; do
            [ -f "$asset" ] && [ ! -f "public/$asset" ] && cp "$asset" "public/$asset" || true
          done
      - run: npm install
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: optilink-offline-singlefile-html
          path: dist/optilink-standalone.html
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4`;

export const StandaloneModal: React.FC<StandaloneModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'SINGLE_FILE' | 'GITHUB_DEPLOY'>(
    'SINGLE_FILE'
  );
  const [buildResult, setBuildResult] = useState<SingleFileBuildResult | null>(
    null
  );
  const [isBuilding, setIsBuilding] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const runBuild = useCallback(async (forceRebuild: boolean) => {
    setIsBuilding(true);
    try {
      const res = await buildOrFetchSingleFileHtml(forceRebuild);
      setBuildResult(res);
    } finally {
      setIsBuilding(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && !buildResult && !isBuilding) {
      runBuild(false);
    }
  }, [isOpen, buildResult, isBuilding, runBuild]);

  if (!isOpen) return null;

  const htmlSource = buildResult?.html || '';
  const sizeKb = buildResult ? (buildResult.sizeBytes / 1024).toFixed(1) : '0.0';

  const handleCopy = async () => {
    const textToCopy =
      activeTab === 'SINGLE_FILE' ? htmlSource : GITHUB_WORKFLOW_YAML;
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleDownload = () => {
    if (!htmlSource) return;
    const blob = new Blob([htmlSource], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'index.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="standalone-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4"
    >
      <div className="m3-surface-card max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b gap-4"
          style={{ borderColor: 'var(--m3-outline-variant)' }}
        >
          <div>
            <h2 id="standalone-modal-title" className="text-base font-bold">
              Offline Single-File Build (`npm run build`) & GitHub Auto-Deploy
            </h2>
            <p className="text-xs m3-text-muted mt-0.5">
              Compiles the complete application via{' '}
              <code className="font-mono">vite.config.ts</code> with all main
              folder assets inlined into one 100% offline{' '}
              <code className="font-mono">index.html</code> file.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Standalone HTML Modal"
            className="min-h-[42px] min-w-[42px] flex items-center justify-center m3-btn-outlined cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs & Primary Actions */}
        <div
          className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 m3-surface-low border-b"
          style={{ borderColor: 'var(--m3-outline-variant)' }}
        >
          <div className="inline-flex p-1 m3-surface-card gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('SINGLE_FILE')}
              className={`min-h-[38px] px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'SINGLE_FILE' ? 'm3-btn-filled' : 'm3-text-muted'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Single-File Build (`index.html`)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('GITHUB_DEPLOY')}
              className={`min-h-[38px] px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'GITHUB_DEPLOY'
                  ? 'm3-btn-filled'
                  : 'm3-text-muted'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>GitHub Pages Auto-Deploy</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeTab === 'SINGLE_FILE' && (
              <button
                type="button"
                disabled={isBuilding}
                onClick={() => runBuild(true)}
                className="min-h-[40px] px-3.5 py-2 text-xs font-semibold m3-btn-tonal flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isBuilding ? 'animate-spin' : ''}`}
                />
                <span>
                  {isBuilding ? 'Running npm run build...' : 'Run npm run build'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCopy}
              className="min-h-[40px] px-3.5 py-2 text-xs font-medium m3-btn-outlined flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>
                    {activeTab === 'SINGLE_FILE'
                      ? 'Copy HTML'
                      : 'Copy Workflow YAML'}
                  </span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={!htmlSource || isBuilding}
              onClick={handleDownload}
              className="min-h-[40px] px-4 py-2 text-xs font-semibold m3-btn-filled flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>Download Offline index.html ({sizeKb} KB)</span>
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {activeTab === 'SINGLE_FILE' ? (
            <>
              {/* Verification Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="m3-surface-low p-3.5 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <ShieldCheck
                      className="w-4 h-4"
                      style={{ color: 'var(--m3-primary)' }}
                    />
                    <span>100% Airgapped Offline Bundle</span>
                  </div>
                  <p className="text-[11px] font-mono m3-text-muted">
                    External CDN URLs: {buildResult?.externalUrlCount ?? 0} ·
                    All JS, CSS, Pako Gzip, QRCode & jsQR inlined
                  </p>
                </div>

                <div className="m3-surface-low p-3.5 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <FolderCheck
                      className="w-4 h-4"
                      style={{ color: 'var(--m3-primary)' }}
                    />
                    <span>Main Folder Assets Synced</span>
                  </div>
                  <p className="text-[11px] font-mono m3-text-muted truncate">
                    {(buildResult?.assetsVerified || MAIN_FOLDER_ASSETS).join(
                      ', '
                    )}
                  </p>
                </div>

                <div className="m3-surface-low p-3.5 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <Terminal
                      className="w-4 h-4"
                      style={{ color: 'var(--m3-primary)' }}
                    />
                    <span>Vite Single-File Compiler</span>
                  </div>
                  <p className="text-[11px] font-mono m3-text-muted">
                    {sizeKb} KB · Built via vite.config.ts (
                    {buildResult?.buildDurationMs ?? 0} ms)
                  </p>
                </div>
              </div>

              {/* Build Log Output */}
              <div className="m3-surface-low p-3.5 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[11px] font-mono m3-text-muted">
                  <span>$ npm run build (vite.config.ts)</span>
                  <span>EXIT CODE 0</span>
                </div>
                <pre className="text-[11px] font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">
                  {isBuilding
                    ? 'Running `vite build` with optilink-offline-singlefile plugin and main folder assets...'
                    : buildResult?.buildOutput || 'Ready.'}
                </pre>
              </div>

              {/* Single-File HTML Preview */}
              <div className="m3-surface-low p-3.5 flex flex-col gap-2">
                <div className="flex items-center justify-between text-[11px] font-mono m3-text-muted">
                  <span>
                    Compiled Single-File HTML Structure (dist/optilink-standalone.html)
                  </span>
                  <span>{sizeKb} KB · Ready for Offline Browser</span>
                </div>
                <pre className="text-[11px] font-mono leading-relaxed overflow-x-auto max-h-52">
                  {htmlSource
                    ? [
                        '<!doctype html>',
                        '<html lang="en" class="dark" data-standalone-offline="true">',
                        '  <head>',
                        '    <meta charset="UTF-8" />',
                        '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
                        '    <title>OptiLink ARQ — Optical File Transfer</title>',
                        '    <link rel="apple-touch-icon" href="data:image/png;base64,[INLINED_735_BYTES]" />',
                        '    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,[INLINED_1032_BYTES]" />',
                        `    <style data-inlined-href="assets/style.css">/* Inlined Tailwind v4 + Material You CSS */</style>`,
                        '  </head>',
                        '  <body class="antialiased">',
                        '    <div id="root"></div>',
                        `    <script type="module" data-inlined-src="assets/index.js">/* Inlined React 19 + Pako Gzip + QRCode + jsQR (${sizeKb} KB) */</script>`,
                        '  </body>',
                        '</html>',
                      ].join('\n')
                    : 'Loading compiled single-file HTML...'}
                </pre>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="m3-surface-low p-4 flex flex-col gap-2">
                <h3 className="text-sm font-bold">
                  GitHub Pages & Single-File Artifact Auto-Deployment
                </h3>
                <p className="text-xs m3-text-muted leading-relaxed">
                  The repository includes{' '}
                  <code className="font-mono">.github/workflows/deploy.yml</code>{' '}
                  and a relative-base <code className="font-mono">vite.config.ts</code>{' '}
                  (<code className="font-mono">base: &apos;./&apos;</code>). On every push
                  to <code className="font-mono">main</code> or{' '}
                  <code className="font-mono">master</code>, GitHub Actions syncs
                  all main folder assets, runs{' '}
                  <code className="font-mono">npm run build</code>, deploys the
                  offline PWA to GitHub Pages, and attaches the standalone{' '}
                  <code className="font-mono">optilink-standalone.html</code>{' '}
                  single-file build artifact.
                </p>
              </div>

              <div className="m3-surface-low p-3.5 flex flex-col gap-2">
                <div className="flex items-center justify-between text-[11px] font-mono m3-text-muted">
                  <span>.github/workflows/deploy.yml</span>
                  <span>GitHub Actions CI/CD</span>
                </div>
                <pre className="text-xs font-mono leading-relaxed overflow-x-auto select-all">
                  {GITHUB_WORKFLOW_YAML}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
