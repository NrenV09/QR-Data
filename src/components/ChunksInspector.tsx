import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Grid,
  List,
  Search,
  Columns2,
} from 'lucide-react';

interface ChunksInspectorProps {
  fileMetadata: { name: string; chunks: number } | null;
  decodedChunks: Record<number, number[] | Uint8Array>;
  receivedCount: number;
  isComplete: boolean;
  reconstructedBytes: Uint8Array | null;
  onTriggerDownload?: () => void;
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
    window.setTimeout(() => setCopiedMissing(false), 1600);
  };

  return (
    <div
      data-testid="chunks-inspector"
      className="m3-surface-card flex flex-col gap-3 p-4"
    >
      {/* Top Header Bar: File Name / Receiver State + Summary Counters + View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-[var(--m3-outline-variant)]">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold tracking-tight text-[var(--m3-on-surface)]">
              Decoded &amp; Undecoded Chunks Registry
            </span>
            <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-[var(--m3-surface-container-high)] text-[var(--m3-primary)] font-semibold truncate max-w-[200px]">
              {fileMetadata
                ? fileMetadata.name
                : totalChunks > 0
                ? 'In-Flight Stream (Awaiting Metadata)'
                : 'No Stream Scanned Yet'}
            </span>
          </div>
          <div className="text-[11px] font-mono m3-text-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span>
              Total: <strong className="text-[var(--m3-on-surface)]">{totalChunks}</strong>
            </span>
            <span>
              Decoded:{' '}
              <strong className="text-emerald-400" data-testid="decoded-chunks-count">
                {receivedCount}
              </strong>
            </span>
            <span>
              Undecoded:{' '}
              <strong
                className={missingCount > 0 ? 'text-amber-400' : 'text-slate-400'}
                data-testid="undecoded-chunks-count"
              >
                {missingCount}
              </strong>
            </span>
            <span>
              Completion: <strong className="text-[var(--m3-on-surface)]">{progressPct}%</strong>
            </span>
          </div>
        </div>

        {/* View Mode & Filter Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div
            role="group"
            aria-label="Filter Chunks"
            className="inline-flex rounded-full p-1 bg-[var(--m3-surface-container-low)] border border-[var(--m3-outline-variant)] text-[10px] font-mono gap-0.5"
          >
            <button
              type="button"
              onClick={() => setFilter('ALL')}
              className={`px-2.5 py-1 rounded-full transition-colors cursor-pointer ${
                filter === 'ALL'
                  ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)] font-bold'
                  : 'm3-text-muted hover:text-[var(--m3-on-surface)]'
              }`}
            >
              All ({totalChunks})
            </button>
            <button
              type="button"
              onClick={() => setFilter('UNDECODED')}
              className={`px-2.5 py-1 rounded-full transition-colors cursor-pointer ${
                filter === 'UNDECODED'
                  ? 'bg-amber-500 text-black font-bold'
                  : 'm3-text-muted hover:text-[var(--m3-on-surface)]'
              }`}
            >
              Undecoded ({missingCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter('DECODED')}
              className={`px-2.5 py-1 rounded-full transition-colors cursor-pointer ${
                filter === 'DECODED'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'm3-text-muted hover:text-[var(--m3-on-surface)]'
              }`}
            >
              Decoded ({receivedCount})
            </button>
          </div>

          <div
            role="group"
            aria-label="Chunk Display Layout"
            className="inline-flex rounded-full p-1 bg-[var(--m3-surface-container-low)] border border-[var(--m3-outline-variant)] text-[10px] font-mono gap-0.5"
          >
            <button
              type="button"
              title="Side-by-Side Decoded & Undecoded Lists + Table"
              onClick={() => setViewMode('SPLIT')}
              className={`px-2.5 py-1 rounded-full cursor-pointer flex items-center gap-1 ${
                viewMode === 'SPLIT'
                  ? 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)] font-bold'
                  : 'm3-text-muted'
              }`}
            >
              <Columns2 className="w-3 h-3" />
              <span>Split Lists</span>
            </button>
            <button
              type="button"
              title="Unified Table View"
              onClick={() => setViewMode('TABLE')}
              className={`px-2.5 py-1 rounded-full cursor-pointer flex items-center gap-1 ${
                viewMode === 'TABLE'
                  ? 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)] font-bold'
                  : 'm3-text-muted'
              }`}
            >
              <List className="w-3 h-3" />
              <span>Table</span>
            </button>
            <button
              type="button"
              title="Compact Index Matrix"
              onClick={() => setViewMode('GRID')}
              className={`px-2.5 py-1 rounded-full cursor-pointer flex items-center gap-1 ${
                viewMode === 'GRID'
                  ? 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)] font-bold'
                  : 'm3-text-muted'
              }`}
            >
              <Grid className="w-3 h-3" />
              <span>Matrix</span>
            </button>
          </div>
        </div>
      </div>

      {/* Expressive Smooth Progress Track */}
      <div className="w-full h-2.5 rounded-full bg-[var(--m3-surface-container-low)] overflow-hidden p-0.5 border border-[var(--m3-outline-variant)]">
        <div
          className="h-full transition-all duration-150 rounded-full bg-[var(--m3-primary)]"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* SIDE-BY-SIDE DECODED & UNDECODED CHUNK LISTS (Shown in SPLIT Mode) */}
      {viewMode === 'SPLIT' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* LEFT: UNDECODED (MISSING) CHUNKS LIST */}
          <div
            data-testid="undecoded-chunks-panel"
            style={{ borderRadius: 'var(--m3-radius-md)' }}
            className="border border-[var(--m3-outline-variant)] bg-[var(--m3-surface-container-low)] flex flex-col overflow-hidden"
          >
            <div className="px-3 py-2 bg-[var(--m3-surface-container-high)] border-b border-[var(--m3-outline-variant)] flex items-center justify-between gap-2 text-[10px] font-mono">
              <span className="font-bold text-amber-400 flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                <span>UNDECODED CHUNKS ({undecodedList.length})</span>
              </span>
              {undecodedList.length > 0 && (
                <button
                  type="button"
                  onClick={handleCopyMissingIndices}
                  className="px-2 py-0.5 rounded-full bg-[var(--m3-surface)] text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer border border-[var(--m3-outline-variant)]"
                >
                  <Copy className="w-2.5 h-2.5" />
                  <span>{copiedMissing ? 'Copied' : 'Copy IDs'}</span>
                </button>
              )}
            </div>

            <div className="max-h-44 overflow-y-auto divide-y divide-[var(--m3-outline-variant)] text-[11px] font-mono">
              {totalChunks === 0 ? (
                <div className="p-3.5 text-slate-400 text-[11px]">
                  No undecoded chunks queued yet. Point camera at Sender QR stream to index chunks.
                </div>
              ) : undecodedList.length === 0 ? (
                <div className="p-3.5 text-emerald-400 font-semibold text-[11px] flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>0 undecoded chunks remaining — all {totalChunks} chunks decoded!</span>
                </div>
              ) : (
                undecodedList.map((item) => (
                  <div
                    key={item.index}
                    className="px-3 py-1.5 flex items-center justify-between gap-2 hover:bg-[var(--m3-surface)]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-amber-300">
                        Chunk #{item.index.toString().padStart(2, '0')}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Index {item.index}
                      </span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950/50 text-amber-300 border border-amber-800/50">
                      UNDECODED
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* RIGHT: DECODED (VERIFIED) CHUNKS LIST */}
          <div
            data-testid="decoded-chunks-panel"
            style={{ borderRadius: 'var(--m3-radius-md)' }}
            className="border border-[var(--m3-outline-variant)] bg-[var(--m3-surface-container-low)] flex flex-col overflow-hidden"
          >
            <div className="px-3 py-2 bg-[var(--m3-surface-container-high)] border-b border-[var(--m3-outline-variant)] flex items-center justify-between gap-2 text-[10px] font-mono">
              <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3" />
                <span>DECODED CHUNKS ({decodedList.length})</span>
              </span>
              <span className="text-slate-400">
                {decodedList.reduce((acc, c) => acc + (c.byteLength || 0), 0)} B buffered
              </span>
            </div>

            <div className="max-h-44 overflow-y-auto divide-y divide-[var(--m3-outline-variant)] text-[11px] font-mono">
              {decodedList.length === 0 ? (
                <div className="p-3.5 text-slate-400 text-[11px]">
                  0 chunks decoded so far. Scanned QR frames will appear here in real time.
                </div>
              ) : (
                decodedList.map((item) => (
                  <div
                    key={item.index}
                    className="px-3 py-1.5 flex items-center justify-between gap-2 bg-emerald-950/10 hover:bg-[var(--m3-surface)]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-emerald-300">
                        Chunk #{item.index.toString().padStart(2, '0')}
                      </span>
                      <span className="text-[10px] text-slate-300">
                        {item.byteLength ?? 0} B
                      </span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 font-semibold">
                      DECODED
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* COMPACT INDEX MATRIX (Shown in GRID Mode or when totalChunks > 0 in SPLIT Mode) */}
      {(viewMode === 'GRID' || (viewMode === 'SPLIT' && totalChunks > 0)) && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[10px] font-mono m3-text-muted px-1">
            <span>CHUNK INDEX MAP (0 .. {Math.max(0, totalChunks - 1)})</span>
            <span className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" /> Decoded
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full border border-amber-500/80 bg-slate-900 inline-block" /> Undecoded
              </span>
            </span>
          </div>
          {totalChunks === 0 ? (
            <div
              style={{ borderRadius: 'var(--m3-radius-md)' }}
              className="p-3 bg-[var(--m3-surface-container-low)] border border-[var(--m3-outline-variant)] text-[11px] font-mono text-slate-400"
            >
              No chunk slots allocated yet — awaiting initial QR frame scan.
            </div>
          ) : (
            <div
              style={{ borderRadius: 'var(--m3-radius-md)' }}
              className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2.5 bg-[var(--m3-surface-container-low)] border border-[var(--m3-outline-variant)]"
            >
              {chunkList.map((chunk) => (
                <div
                  key={chunk.index}
                  title={`Chunk #${chunk.index}: ${
                    chunk.isDecoded
                      ? `Decoded (${chunk.byteLength} B)`
                      : 'Undecoded (Awaiting scan)'
                  }`}
                  className={`w-7 h-6 rounded-lg text-[10px] font-mono font-bold flex items-center justify-center transition-colors ${
                    chunk.isDecoded
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'border border-amber-600/50 text-amber-300/90 bg-amber-950/25'
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
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 text-[10px] font-mono m3-text-muted px-1">
            <span>
              UNIFIED CHUNK TABLE ({filteredChunks.length} OF {totalChunks} SHOWN)
            </span>
            <div className="flex items-center gap-1.5 bg-[var(--m3-surface-container-low)] px-2.5 py-1 rounded-full border border-[var(--m3-outline-variant)]">
              <Search className="w-3 h-3 text-slate-400" />
              <input
                type="text"
                aria-label="Filter chunk by number"
                placeholder="Jump to chunk #..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none font-mono text-[10px] w-28 text-[var(--m3-on-surface)]"
              />
            </div>
          </div>

          <div
            style={{ borderRadius: 'var(--m3-radius-md)' }}
            className="max-h-52 overflow-y-auto border border-[var(--m3-outline-variant)] bg-[var(--m3-surface-container-low)]"
          >
            <table className="w-full text-left border-collapse text-[11px] font-mono">
              <thead>
                <tr className="border-b border-[var(--m3-outline-variant)] bg-[var(--m3-surface-container-high)] text-slate-400 text-[10px]">
                  <th className="py-1.5 px-3 w-20">Chunk ID</th>
                  <th className="py-1.5 px-3 w-28">State</th>
                  <th className="py-1.5 px-3 w-24">Payload</th>
                  <th className="py-1.5 px-3">Buffer Diagnostics</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--m3-outline-variant)]">
                {totalChunks === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 px-3 text-center text-slate-400">
                      0 chunks indexed — scan a transmitter QR frame to populate this table.
                    </td>
                  </tr>
                ) : filteredChunks.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 px-3 text-center text-slate-400">
                      No chunks match filter &ldquo;{filter}&rdquo;
                    </td>
                  </tr>
                ) : (
                  filteredChunks.map((chunk) => (
                    <tr
                      key={chunk.index}
                      className={`hover:bg-[var(--m3-surface)] transition-colors ${
                        chunk.isDecoded ? 'bg-emerald-950/10' : ''
                      }`}
                    >
                      <td className="py-1.5 px-3 font-bold">
                        #{chunk.index.toString().padStart(2, '0')}
                      </td>
                      <td className="py-1.5 px-3">
                        {chunk.isDecoded ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/60">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            DECODED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-950/50 px-2 py-0.5 rounded-full border border-amber-800/50">
                            <Clock className="w-2.5 h-2.5" />
                            UNDECODED
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-slate-300">
                        {chunk.byteLength !== null ? `${chunk.byteLength} B` : '—'}
                      </td>
                      <td className="py-1.5 px-3 text-[10px] text-slate-400 truncate">
                        {chunk.isDecoded
                          ? 'Verified in receiver buffer'
                          : 'Waiting for optical frame'}
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
        <div className="pt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--m3-outline-variant)]">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              Transfer Complete: {totalChunks}/{totalChunks} chunks decoded &amp; inflated (
              {reconstructedBytes.byteLength} B)
            </span>
          </div>
          {onTriggerDownload && (
            <button
              type="button"
              onClick={onTriggerDownload}
              className="min-h-[34px] px-4 py-1.5 text-xs font-semibold m3-btn-filled rounded-full flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
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
