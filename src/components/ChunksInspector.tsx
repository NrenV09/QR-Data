import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  QrCode,
  Search,
  Sparkles,
} from 'lucide-react';

interface ChunksInspectorProps {
  fileMetadata: { name: string; chunks: number } | null;
  decodedChunks: Record<number, number[] | Uint8Array>;
  receivedCount: number;
  isComplete: boolean;
  reconstructedBytes: Uint8Array | null;
  onTriggerDownload?: () => void;
  onSimulateSampleScan?: () => void;
  onNotify?: (title: string, description?: string) => void;
  embedded?: boolean;
}

export type ChunkFilter = 'ALL' | 'UNDECODED' | 'DECODED';
export type ChunkViewMode = 'SPLIT' | 'TABLE' | 'GRID';

export interface ChunkSlotItem {
  index: number;
  isDecoded: boolean;
  byteLength: number | null;
}

export const ChunksInspector: React.FC<ChunksInspectorProps> = ({
  fileMetadata,
  decodedChunks,
  receivedCount,
  isComplete,
  reconstructedBytes,
  onTriggerDownload,
  onSimulateSampleScan,
  onNotify,
  embedded = false,
}) => {
  const [filter, setFilter] = useState<ChunkFilter>('ALL');
  const [viewMode, setViewMode] = useState<ChunkViewMode>('SPLIT');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedMissing, setCopiedMissing] = useState<boolean>(false);

  // Determine total chunks from scanned metadata, or infer from highest scanned chunk index if metadata hasn't arrived yet
  const inferredTotalFromScanned = useMemo(() => {
    const keys = Object.keys(decodedChunks)
      .map(Number)
      .filter((n) => !Number.isNaN(n) && n >= 0);
    if (keys.length === 0) return 0;
    return Math.max(...keys) + 1;
  }, [decodedChunks]);

  const totalChunks = fileMetadata?.chunks ?? inferredTotalFromScanned;
  const missingCount = Math.max(0, totalChunks - receivedCount);
  const progressPct =
    totalChunks > 0
      ? Math.min(100, Math.round((receivedCount / totalChunks) * 100))
      : 0;

  // Build the complete list of all chunks from 0 to totalChunks - 1
  const chunkList = useMemo<ChunkSlotItem[]>(() => {
    if (totalChunks <= 0) return [];
    const list: ChunkSlotItem[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const data = decodedChunks[i];
      const isDecoded = Boolean(data);
      list.push({
        index: i,
        isDecoded,
        byteLength: data ? data.length : null,
      });
    }
    return list;
  }, [totalChunks, decodedChunks]);

  const decodedList = useMemo(
    () => chunkList.filter((c) => c.isDecoded),
    [chunkList]
  );

  const undecodedList = useMemo(
    () => chunkList.filter((c) => !c.isDecoded),
    [chunkList]
  );

  // Filter based on selected filter tab and search query
  const filteredChunks = useMemo(() => {
    return chunkList.filter((item) => {
      if (filter === 'UNDECODED' && item.isDecoded) return false;
      if (filter === 'DECODED' && !item.isDecoded) return false;
      if (searchQuery.trim() !== '') {
        const queryNum = parseInt(searchQuery.trim().replace(/^#/, ''), 10);
        if (!Number.isNaN(queryNum)) {
          return item.index === queryNum;
        }
      }
      return true;
    });
  }, [chunkList, filter, searchQuery]);

  const handleCopyMissingIndices = () => {
    if (undecodedList.length === 0) return;
    const text = undecodedList.map((c) => `#${c.index}`).join(', ');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedMissing(true);
    onNotify?.('Copied Undecoded Chunk IDs', `${text} copied to clipboard`);
    window.setTimeout(() => setCopiedMissing(false), 1600);
  };

  return (
    <div
      data-testid="chunks-inspector"
      className={embedded ? 'flex flex-col h-full' : 'm3-surface-card flex flex-col overflow-hidden'}
    >
      {/* Header Bar: Title + Unboxed Metadata + Clean Segmented Controls */}
      <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--m3-outline-variant)]">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-[var(--m3-on-surface)]">
            <span>Decoded &amp; Undecoded Chunks</span>
            <span aria-hidden="true" className="m3-text-muted">·</span>
            <span className="font-mono text-xs font-normal m3-text-muted truncate max-w-[240px]">
              {fileMetadata
                ? fileMetadata.name
                : totalChunks > 0
                ? 'In-Flight Stream'
                : 'Awaiting Optical Stream'}
            </span>
          </div>

          {/* Unboxed Tabular Metadata */}
          <div className="text-xs font-mono m3-text-muted mt-1 flex flex-wrap items-center gap-2 tabular-nums">
            <span>
              Total <strong className="text-[var(--m3-on-surface)] font-semibold">{totalChunks}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Decoded{' '}
              <strong className="text-emerald-400 font-semibold" data-testid="decoded-chunks-count">
                {receivedCount}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Undecoded{' '}
              <strong
                className={missingCount > 0 ? 'text-amber-400 font-semibold' : 'm3-text-muted'}
                data-testid="undecoded-chunks-count"
              >
                {missingCount}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-[var(--m3-on-surface)] font-semibold">{progressPct}%</strong> complete
            </span>
          </div>
        </div>

        {/* Clean Interactive Segmented Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Filter Chunks"
            className="inline-flex rounded-xl p-1 bg-[var(--m3-surface-container-low)] border border-[var(--m3-outline-variant)] text-xs font-medium"
          >
            <button
              type="button"
              onClick={() => setFilter('ALL')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                filter === 'ALL'
                  ? 'bg-[var(--m3-surface-container-high)] text-[var(--m3-on-surface)] font-semibold'
                  : 'm3-text-muted hover:text-[var(--m3-on-surface)]'
              }`}
            >
              All ({totalChunks})
            </button>
            <button
              type="button"
              onClick={() => setFilter('UNDECODED')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                filter === 'UNDECODED'
                  ? 'bg-[var(--m3-surface-container-high)] text-amber-400 font-semibold'
                  : 'm3-text-muted hover:text-[var(--m3-on-surface)]'
              }`}
            >
              Undecoded ({missingCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter('DECODED')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                filter === 'DECODED'
                  ? 'bg-[var(--m3-surface-container-high)] text-emerald-400 font-semibold'
                  : 'm3-text-muted hover:text-[var(--m3-on-surface)]'
              }`}
            >
              Decoded ({receivedCount})
            </button>
          </div>

          <div
            role="group"
            aria-label="Chunk Display Layout"
            className="inline-flex rounded-xl p-1 bg-[var(--m3-surface-container-low)] border border-[var(--m3-outline-variant)] text-xs font-medium"
          >
            <button
              type="button"
              onClick={() => setViewMode('SPLIT')}
              className={`px-3 py-1 rounded-lg cursor-pointer whitespace-nowrap transition-colors ${
                viewMode === 'SPLIT'
                  ? 'bg-[var(--m3-surface-container-high)] text-[var(--m3-on-surface)] font-semibold'
                  : 'm3-text-muted hover:text-[var(--m3-on-surface)]'
              }`}
            >
              Split Lists
            </button>
            <button
              type="button"
              onClick={() => setViewMode('TABLE')}
              className={`px-3 py-1 rounded-lg cursor-pointer whitespace-nowrap transition-colors ${
                viewMode === 'TABLE'
                  ? 'bg-[var(--m3-surface-container-high)] text-[var(--m3-on-surface)] font-semibold'
                  : 'm3-text-muted hover:text-[var(--m3-on-surface)]'
              }`}
            >
              Table
            </button>
            <button
              type="button"
              onClick={() => setViewMode('GRID')}
              className={`px-3 py-1 rounded-lg cursor-pointer whitespace-nowrap transition-colors ${
                viewMode === 'GRID'
                  ? 'bg-[var(--m3-surface-container-high)] text-[var(--m3-on-surface)] font-semibold'
                  : 'm3-text-muted hover:text-[var(--m3-on-surface)]'
              }`}
            >
              Matrix
            </button>
          </div>
        </div>
      </div>

      {/* Subtle Hairline Progress Track */}
      <div className="w-full h-1 bg-[var(--m3-surface-container-low)] overflow-hidden">
        <div
          className="h-full transition-all duration-150 bg-[var(--m3-primary)]"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* SIDE-BY-SIDE DECODED & UNDECODED LISTS (Hairline Architecture — Zero Nested Box Clutter) */}
      {viewMode === 'SPLIT' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[var(--m3-outline-variant)] border-b border-[var(--m3-outline-variant)]">
          {/* LEFT: UNDECODED (MISSING) CHUNKS */}
          <div
            data-testid="undecoded-chunks-panel"
            className="flex flex-col"
          >
            <div className="px-6 py-3 flex items-center justify-between gap-2 border-b border-[var(--m3-outline-variant)]">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <span>Undecoded Chunks</span>
                <span aria-hidden="true" className="m3-text-muted">·</span>
                <span className="font-mono text-amber-400 tabular-nums">{undecodedList.length}</span>
              </div>
              {undecodedList.length > 0 && (
                <button
                  type="button"
                  onClick={handleCopyMissingIndices}
                  className="text-xs font-mono m3-text-muted hover:text-[var(--m3-on-surface)] flex items-center gap-1 cursor-pointer transition-colors"
                >
                  {copiedMissing ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy IDs</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="max-h-56 overflow-y-auto divide-y divide-[var(--m3-outline-variant)] text-xs font-mono tabular-nums">
              {totalChunks === 0 ? (
                <div className="px-6 py-7 flex flex-col items-start gap-2.5 font-sans">
                  <div className="w-8 h-8 rounded-xl bg-[var(--m3-surface-container-high)] border border-[var(--m3-outline-variant)] flex items-center justify-center text-amber-400">
                    <QrCode className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[var(--m3-on-surface)]">
                      No Undecoded Chunks Queued
                    </div>
                    <p className="text-[11px] m3-text-muted leading-relaxed mt-0.5">
                      Point the 60Hz receiver camera at the sender&apos;s QR stream to index incoming frames.
                    </p>
                  </div>
                  {onSimulateSampleScan && (
                    <button
                      type="button"
                      onClick={onSimulateSampleScan}
                      className="mt-1 min-h-[28px] px-3 py-1 rounded-full text-[11px] font-medium m3-btn-tonal flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Preview Sample Chunk Split</span>
                    </button>
                  )}
                </div>
              ) : undecodedList.length === 0 ? (
                <div className="px-6 py-8 text-emerald-400 font-sans text-xs font-medium">
                  All {totalChunks} chunks have been verified and decoded.
                </div>
              ) : (
                undecodedList.map((item) => (
                  <div
                    key={item.index}
                    className="px-6 py-2.5 flex items-center justify-between gap-3 hover:bg-[var(--m3-surface-container-low)] transition-colors"
                  >
                    <span className="font-semibold text-[var(--m3-on-surface)]">
                      Chunk #{item.index.toString().padStart(2, '0')}
                    </span>
                    <span className="text-amber-400">
                      ○ Undecoded
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* RIGHT: DECODED (VERIFIED) CHUNKS */}
          <div
            data-testid="decoded-chunks-panel"
            className="flex flex-col"
          >
            <div className="px-6 py-3 flex items-center justify-between gap-2 border-b border-[var(--m3-outline-variant)]">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <span>Decoded Chunks</span>
                <span aria-hidden="true" className="m3-text-muted">·</span>
                <span className="font-mono text-emerald-400 tabular-nums">{decodedList.length}</span>
              </div>
              <span className="text-xs font-mono m3-text-muted tabular-nums">
                {decodedList.reduce((acc, c) => acc + (c.byteLength || 0), 0)} B buffered
              </span>
            </div>

            <div className="max-h-56 overflow-y-auto divide-y divide-[var(--m3-outline-variant)] text-xs font-mono tabular-nums">
              {decodedList.length === 0 ? (
                <div className="px-6 py-7 flex flex-col items-start gap-2.5 font-sans">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
                    <Check className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[var(--m3-on-surface)]">
                      Awaiting Verified Chunks
                    </div>
                    <p className="text-[11px] m3-text-muted leading-relaxed mt-0.5">
                      0 chunks decoded so far. Verified frames appear here immediately upon optical capture.
                    </p>
                  </div>
                </div>
              ) : (
                decodedList.map((item) => (
                  <div
                    key={item.index}
                    className="px-6 py-2.5 flex items-center justify-between gap-3 hover:bg-[var(--m3-surface-container-low)] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-[var(--m3-on-surface)]">
                        Chunk #{item.index.toString().padStart(2, '0')}
                      </span>
                      <span className="m3-text-muted">
                        {item.byteLength ?? 0} B
                      </span>
                    </div>
                    <span className="text-emerald-400 font-medium">
                      ● Decoded
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* CHUNK INDEX MAP (Shown in GRID Mode or when totalChunks > 0 in SPLIT Mode) */}
      {(viewMode === 'GRID' || (viewMode === 'SPLIT' && totalChunks > 0)) && (
        <div className="px-6 py-4 flex flex-col gap-2.5 border-b border-[var(--m3-outline-variant)]">
          <div className="flex items-center justify-between text-xs m3-text-muted">
            <span className="font-medium text-[var(--m3-on-surface)]">
              Chunk Index Map (0–{Math.max(0, totalChunks - 1)})
            </span>
            <span className="font-mono flex items-center gap-3 text-[11px]">
              <span className="text-emerald-400">● Decoded</span>
              <span className="text-amber-400">○ Undecoded</span>
            </span>
          </div>
          {totalChunks === 0 ? (
            <div className="py-3 text-xs m3-text-muted">
              No chunk slots allocated yet — awaiting initial QR frame scan.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pt-1">
              {chunkList.map((chunk) => (
                <div
                  key={chunk.index}
                  title={`Chunk #${chunk.index}: ${
                    chunk.isDecoded
                      ? `Decoded (${chunk.byteLength} B)`
                      : 'Undecoded (Awaiting scan)'
                  }`}
                  className={`w-8 h-7 rounded-lg text-xs font-mono font-semibold tabular-nums flex items-center justify-center transition-colors ${
                    chunk.isDecoded
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
                      : 'bg-[var(--m3-surface-container-low)] m3-text-muted border border-[var(--m3-outline-variant)]'
                  }`}
                >
                  {chunk.index}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* UNIFIED ALL-CHUNKS TABLE (Shown in TABLE Mode or when Filtered) */}
      {(viewMode === 'TABLE' || filter !== 'ALL' || searchQuery.trim() !== '') && (
        <div className="flex flex-col">
          <div className="px-6 py-3 flex items-center justify-between gap-2 border-b border-[var(--m3-outline-variant)]">
            <span className="text-xs font-semibold">
              Chunk Ledger ({filteredChunks.length} of {totalChunks})
            </span>
            <div className="flex items-center gap-1.5 bg-[var(--m3-surface-container-low)] px-3 py-1 rounded-xl border border-[var(--m3-outline-variant)]">
              <Search className="w-3.5 h-3.5 m3-text-muted" />
              <input
                type="text"
                aria-label="Filter chunk by number"
                placeholder="Find chunk #..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none font-mono text-xs w-28 text-[var(--m3-on-surface)]"
              />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
              <thead>
                <tr className="border-b border-[var(--m3-outline-variant)] m3-text-muted font-sans">
                  <th className="py-2.5 px-6 font-medium">Chunk</th>
                  <th className="py-2.5 px-4 font-medium">Status</th>
                  <th className="py-2.5 px-4 font-medium text-right">Size</th>
                  <th className="py-2.5 px-6 font-medium">Buffer Diagnostics</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--m3-outline-variant)]">
                {totalChunks === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 px-6 text-center m3-text-muted font-sans">
                      0 chunks indexed — scan a transmitter QR frame to populate this ledger.
                    </td>
                  </tr>
                ) : filteredChunks.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 px-6 text-center m3-text-muted font-sans">
                      No chunks match filter &ldquo;{filter}&rdquo;
                    </td>
                  </tr>
                ) : (
                  filteredChunks.map((chunk) => (
                    <tr
                      key={chunk.index}
                      className="hover:bg-[var(--m3-surface-container-low)] transition-colors"
                    >
                      <td className="py-2.5 px-6 font-semibold text-[var(--m3-on-surface)]">
                        #{chunk.index.toString().padStart(2, '0')}
                      </td>
                      <td className="py-2.5 px-4">
                        {chunk.isDecoded ? (
                          <span className="text-emerald-400 font-medium">
                            ● Decoded
                          </span>
                        ) : (
                          <span className="text-amber-400">
                            ○ Undecoded
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right m3-text-muted">
                        {chunk.byteLength !== null ? `${chunk.byteLength} B` : '—'}
                      </td>
                      <td className="py-2.5 px-6 m3-text-muted font-sans">
                        {chunk.isDecoded
                          ? 'Verified in decompression buffer'
                          : 'Awaiting optical scan'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reconstructed File Download Bar (ONLY appears on Receiver when all chunks are decoded) */}
      {isComplete && reconstructedBytes && (
        <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 bg-emerald-500/5">
          <div className="text-xs font-medium text-emerald-400">
            All {totalChunks} chunks verified and inflated ({reconstructedBytes.byteLength.toLocaleString()} B)
          </div>
          {onTriggerDownload && (
            <button
              type="button"
              onClick={onTriggerDownload}
              className="min-h-[36px] px-4 py-1.5 text-xs font-semibold m3-btn-filled rounded-full flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save Reconstructed File</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
