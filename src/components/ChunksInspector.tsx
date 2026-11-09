import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Grid,
  List,
  Search,
} from 'lucide-react';

interface ChunksInspectorProps {
  fileMetadata: { name: string; chunks: number } | null;
  decodedChunks: Record<number, number[] | Uint8Array>;
  receivedCount: number;
  isComplete: boolean;
  reconstructedBytes: Uint8Array | null;
  onTriggerDownload?: () => void;
}

export type ChunkFilter = 'ALL' | 'MISSING' | 'DECODED';
export type ChunkViewMode = 'TABLE' | 'GRID' | 'SPLIT';

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

  const totalChunks = fileMetadata?.chunks ?? 0;
  const missingCount = Math.max(0, totalChunks - receivedCount);
  const progressPct =
    totalChunks > 0 ? Math.min(100, Math.round((receivedCount / totalChunks) * 100)) : 0;

  // Build the complete list of all chunks from 0 to totalChunks - 1
  const chunkList = useMemo(() => {
    if (!totalChunks) return [];
    const list = [];
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

  // Filter based on selected filter tab and search query
  const filteredChunks = useMemo(() => {
    return chunkList.filter((item) => {
      if (filter === 'MISSING' && item.isDecoded) return false;
      if (filter === 'DECODED' && !item.isDecoded) return false;
      if (searchQuery.trim() !== '') {
        const queryNum = parseInt(searchQuery.trim(), 10);
        if (!isNaN(queryNum)) {
          return item.index === queryNum;
        }
      }
      return true;
    });
  }, [chunkList, filter, searchQuery]);

  if (!fileMetadata || totalChunks === 0) {
    return (
      <div className="m3-surface-low border border-[var(--m3-outline-variant)] rounded-[var(--m3-radius-md)] p-4 flex flex-col items-center justify-center text-center gap-2 min-h-[140px]">
        <Clock className="w-5 h-5 m3-text-muted animate-pulse" />
        <div className="text-xs font-semibold">Receiver Armed — Awaiting Transmission</div>
        <p className="text-[11px] font-mono m3-text-muted max-w-sm">
          Point camera at the transmitting device. Once the initial Metadata QR frame is scanned,
          the live list of all decoded &amp; undecoded chunks will be indexed here.
        </p>
      </div>
    );
  }

  return (
    <div className="m3-surface-low border border-[var(--m3-outline-variant)] rounded-[var(--m3-radius-md)] flex flex-col gap-3 p-3.5">
      {/* Top Header: File Summary, Counts & Overall Progress */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-[var(--m3-outline-variant)]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-[var(--m3-primary)] truncate max-w-[220px] sm:max-w-xs">
              {fileMetadata.name}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--m3-surface-container-high)] text-[var(--m3-on-surface-variant)]">
              {totalChunks} Chunks
            </span>
          </div>
          <div className="text-[11px] font-mono m3-text-muted mt-0.5">
            Decoded: <strong className="text-[var(--m3-on-surface)]">{receivedCount}</strong> · Missing:{' '}
            <strong className={missingCount > 0 ? 'text-amber-400' : 'text-emerald-400'}>
              {missingCount}
            </strong>{' '}
            · Progress: <strong className="text-[var(--m3-on-surface)]">{progressPct}%</strong>
          </div>
        </div>

        {/* View Mode & Filter Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-md p-0.5 bg-[var(--m3-surface-container-high)] text-[11px] font-mono">
            <button
              type="button"
              onClick={() => setFilter('ALL')}
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                filter === 'ALL'
                  ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)] font-bold'
                  : 'm3-text-muted hover:text-[var(--m3-on-surface)]'
              }`}
            >
              All ({totalChunks})
            </button>
            <button
              type="button"
              onClick={() => setFilter('MISSING')}
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                filter === 'MISSING'
                  ? 'bg-amber-500 text-black font-bold'
                  : 'm3-text-muted hover:text-[var(--m3-on-surface)]'
              }`}
            >
              Missing ({missingCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter('DECODED')}
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                filter === 'DECODED'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'm3-text-muted hover:text-[var(--m3-on-surface)]'
              }`}
            >
              Decoded ({receivedCount})
            </button>
          </div>

          <div className="inline-flex rounded-md p-0.5 bg-[var(--m3-surface-container-high)]">
            <button
              type="button"
              title="Table / List View"
              onClick={() => setViewMode('TABLE')}
              className={`p-1 rounded cursor-pointer ${
                viewMode === 'TABLE' ? 'bg-[var(--m3-surface)] text-[var(--m3-primary)]' : 'm3-text-muted'
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Grid Matrix View"
              onClick={() => setViewMode('GRID')}
              className={`p-1 rounded cursor-pointer ${
                viewMode === 'GRID' ? 'bg-[var(--m3-surface)] text-[var(--m3-primary)]' : 'm3-text-muted'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Split View (Grid + Table)"
              onClick={() => setViewMode('SPLIT')}
              className={`p-1 rounded cursor-pointer ${
                viewMode === 'SPLIT' ? 'bg-[var(--m3-surface)] text-[var(--m3-primary)]' : 'm3-text-muted'
              }`}
            >
              <span className="text-[10px] font-mono px-1 font-bold">Split</span>
            </button>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2 rounded-full bg-[var(--m3-surface-container-high)] overflow-hidden">
        <div
          className="h-full transition-all duration-150 rounded-full bg-[var(--m3-primary)]"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Optional Grid Matrix (shown in GRID or SPLIT mode) */}
      {(viewMode === 'GRID' || viewMode === 'SPLIT') && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[10px] font-mono m3-text-muted">
            <span>CHUNK RECEPTION MATRIX</span>
            <span>
              {receivedCount}/{totalChunks} captured
            </span>
          </div>
          <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto p-1 rounded bg-[var(--m3-surface-container-low)]">
            {chunkList.map((chunk) => (
              <div
                key={chunk.index}
                title={`Chunk #${chunk.index}: ${
                  chunk.isDecoded ? `Decoded (${chunk.byteLength} B)` : 'Missing / Awaiting scan'
                }`}
                className={`w-6 h-6 rounded text-[9px] font-mono font-bold flex items-center justify-center transition-all ${
                  chunk.isDecoded
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'border border-dashed border-slate-700 text-slate-400 bg-slate-900/50'
                }`}
              >
                {chunk.index}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detailed List / Table View (shown in TABLE or SPLIT mode) */}
      {(viewMode === 'TABLE' || viewMode === 'SPLIT') && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[10px] font-mono m3-text-muted">
            <span>DETAILED CHUNKS REGISTRY ({filteredChunks.length} ITEMS)</span>
            {totalChunks > 20 && (
              <div className="flex items-center gap-1 bg-[var(--m3-surface-container-high)] px-1.5 py-0.5 rounded text-[10px]">
                <Search className="w-3 h-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Find chunk #"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none outline-none font-mono text-[10px] w-20 text-[var(--m3-on-surface)]"
                />
              </div>
            )}
          </div>

          <div className="max-h-52 overflow-y-auto rounded border border-[var(--m3-outline-variant)] bg-[var(--m3-surface-container-low)]">
            <table className="w-full text-left border-collapse text-[11px] font-mono">
              <thead>
                <tr className="border-b border-[var(--m3-outline-variant)] bg-[var(--m3-surface-container-high)] text-slate-400 text-[10px]">
                  <th className="py-1 px-2.5 w-16">Chunk</th>
                  <th className="py-1 px-2.5 w-28">Status</th>
                  <th className="py-1 px-2.5 w-24">Data Size</th>
                  <th className="py-1 px-2.5">Buffer Telemetry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--m3-outline-variant)]">
                {filteredChunks.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-slate-500 italic">
                      No chunks match the current filter
                    </td>
                  </tr>
                ) : (
                  filteredChunks.map((chunk) => (
                    <tr
                      key={chunk.index}
                      className={`hover:bg-[var(--m3-surface)] transition-colors ${
                        chunk.isDecoded ? 'bg-emerald-950/15' : ''
                      }`}
                    >
                      <td className="py-1.5 px-2.5 font-bold">
                        #{chunk.index.toString().padStart(2, '0')}
                      </td>
                      <td className="py-1.5 px-2.5">
                        {chunk.isDecoded ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/60">
                            <CheckCircle2 className="w-3 h-3" />
                            Decoded
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/40">
                            <Clock className="w-3 h-3" />
                            Missing
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-2.5 text-slate-300">
                        {chunk.byteLength ? `${chunk.byteLength} B` : '—'}
                      </td>
                      <td className="py-1.5 px-2.5 text-[10px] text-slate-400 truncate">
                        {chunk.isDecoded
                          ? '✓ Verified in decompression buffer'
                          : '⏳ Awaiting optical scan from camera'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Completion & Download Banner */}
      {isComplete && reconstructedBytes && (
        <div className="pt-2 flex items-center justify-between gap-3 border-t border-[var(--m3-outline-variant)]">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              All {totalChunks} chunks received &amp; inflated ({reconstructedBytes.byteLength} B)
            </span>
          </div>
          {onTriggerDownload && (
            <button
              type="button"
              onClick={onTriggerDownload}
              className="min-h-[34px] px-3 py-1.5 text-xs font-semibold m3-btn-filled flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save / Download File</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
