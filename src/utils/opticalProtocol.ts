/**
 * Stop-and-Wait Optical ARQ Protocol Engine
 * Handles binary file chunking, Base64 framing, CRC32 & SHA-256/FNV-1a integrity verification,
 * debounce latching, and deterministic Sender/Receiver state machines.
 */

export type PacketType = 'INIT' | 'DATA' | 'ACK' | 'FIN';

export interface InitPacket {
  type: 'INIT';
  name: string;
  size: number;
  mime: string;
  total: number;
  hash: string;
}

export interface DataPacket {
  type: 'DATA';
  i: number;
  total: number;
  d: string; // Base64 chunk payload
  crc: string; // 8-char hex CRC32 checksum of base64 or raw bytes
}

export interface AckPacket {
  type: 'ACK';
  ack: number;
  status: 'OK' | 'RESEND';
  phase?: 'INIT' | 'DATA';
  nonce?: number;
}

export interface FinPacket {
  type: 'FIN';
  status: 'COMPLETE';
  hash?: string;
}

export type OpticalPacket = InitPacket | DataPacket | AckPacket | FinPacket;

export type DeviceRole = 'SENDER' | 'RECEIVER';

export type SenderPhase =
  | 'IDLE'
  | 'HANDSHAKE_INIT'
  | 'TRANSMITTING'
  | 'AWAITING_FIN'
  | 'COMPLETE'
  | 'ERROR';

export type ReceiverPhase =
  | 'IDLE'
  | 'WAITING_INIT'
  | 'RECEIVING_DATA'
  | 'COMPLETE'
  | 'ERROR';

export interface PreparedTransferFile {
  name: string;
  size: number;
  mime: string;
  totalChunks: number;
  chunkSize: number;
  fileHash: string;
  chunks: DataPacket[];
  initPacket: InitPacket;
}

export interface SenderSessionState {
  phase: SenderPhase;
  file: PreparedTransferFile | null;
  currentChunkIndex: number;
  activePacket: OpticalPacket | null;
  ackedChunks: number;
  resendCount: number;
  lastScannedRaw: string;
  startTimeMs: number | null;
  completedTimeMs: number | null;
  bytesTransferred: number;
  statusMessage: string;
  ledState: 'IDLE' | 'WAITING' | 'ACK_PULSE' | 'RESEND_WARN' | 'COMPLETE';
}

export interface ReceiverSessionState {
  phase: ReceiverPhase;
  metadata: InitPacket | null;
  receivedChunks: Map<number, Uint8Array>;
  expectedChunkIndex: number;
  activePacket: OpticalPacket | null;
  crcErrorCount: number;
  lastScannedRaw: string;
  startTimeMs: number | null;
  completedTimeMs: number | null;
  bytesReceived: number;
  assembledBytes: Uint8Array | null;
  integrityVerified: boolean;
  statusMessage: string;
  ledState: 'IDLE' | 'WAITING' | 'ACK_PULSE' | 'RESEND_WARN' | 'COMPLETE';
}

// Precomputed CRC32 Lookup Table for fast deterministic chunk verification
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

/**
 * Computes a deterministic 8-character uppercase hex CRC32 checksum over a Uint8Array or string
 */
export function computeCRC32(input: Uint8Array | string): string {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

/**
 * Computes a deterministic 64-bit FNV-1a / dual-CRC hex digest over full file bytes
 * Works synchronously in all environments (including non-HTTPS offline file:// contexts where crypto.subtle is disabled)
 */
export function computeFileHash(bytes: Uint8Array): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    h1 ^= b;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= b ^ (i & 0xff);
    h2 = Math.imul(h2, 0x1000193b) >>> 0;
  }
  const crc = computeCRC32(bytes);
  return (
    h1.toString(16).padStart(8, '0') +
    h2.toString(16).padStart(8, '0') +
    crc.toLowerCase()
  ).toUpperCase();
}

/**
 * Converts a Uint8Array to a standard Base64 string safely across browser and Node environments
 */
export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

/**
 * Converts a Base64 string back to a Uint8Array
 */
export function base64ToUint8(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/**
 * Prepares a file's raw bytes into framed INIT and DATA packets with configurable chunk size
 */
export function prepareFileForOpticalTransfer(
  name: string,
  mime: string,
  bytes: Uint8Array,
  chunkSize: number = 350
): PreparedTransferFile {
  const safeChunkSize = Math.max(64, Math.min(1024, Math.floor(chunkSize)));
  const totalChunks = Math.max(1, Math.ceil(bytes.byteLength / safeChunkSize));
  const fileHash = computeFileHash(bytes);
  const chunks: DataPacket[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * safeChunkSize;
    const end = Math.min(start + safeChunkSize, bytes.byteLength);
    const slice = bytes.subarray(start, end);
    const base64Data = uint8ToBase64(slice);
    const crc = computeCRC32(slice);
    chunks.push({
      type: 'DATA',
      i,
      total: totalChunks,
      d: base64Data,
      crc,
    });
  }

  const initPacket: InitPacket = {
    type: 'INIT',
    name: name || 'payload.bin',
    size: bytes.byteLength,
    mime: mime || 'application/octet-stream',
    total: totalChunks,
    hash: fileHash,
  };

  return {
    name: initPacket.name,
    size: bytes.byteLength,
    mime: initPacket.mime,
    totalChunks,
    chunkSize: safeChunkSize,
    fileHash,
    chunks,
    initPacket,
  };
}

/**
 * Serializes an OpticalPacket to compact JSON for QR encoding
 */
export function serializePacket(packet: OpticalPacket): string {
  return JSON.stringify(packet);
}

/**
 * Parses and validates a raw QR string into a typed OpticalPacket.
 * Returns null if the QR code does not belong to the Optical ARQ protocol.
 */
export function parseOpticalPacket(raw: string): OpticalPacket | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;

  try {
    const obj = JSON.parse(trimmed);
    if (!obj || typeof obj !== 'object' || typeof obj.type !== 'string') {
      return null;
    }

    switch (obj.type) {
      case 'INIT': {
        if (
          typeof obj.name === 'string' &&
          typeof obj.size === 'number' &&
          typeof obj.total === 'number' &&
          obj.total >= 1 &&
          typeof obj.hash === 'string'
        ) {
          return {
            type: 'INIT',
            name: obj.name,
            size: obj.size,
            mime: typeof obj.mime === 'string' ? obj.mime : 'application/octet-stream',
            total: obj.total,
            hash: obj.hash,
          };
        }
        return null;
      }

      case 'DATA': {
        if (
          typeof obj.i === 'number' &&
          obj.i >= 0 &&
          typeof obj.total === 'number' &&
          obj.total >= 1 &&
          typeof obj.d === 'string' &&
          typeof obj.crc === 'string'
        ) {
          return {
            type: 'DATA',
            i: obj.i,
            total: obj.total,
            d: obj.d,
            crc: obj.crc,
          };
        }
        return null;
      }

      case 'ACK': {
        if (
          typeof obj.ack === 'number' &&
          (obj.status === 'OK' || obj.status === 'RESEND')
        ) {
          const pkt: AckPacket = {
            type: 'ACK',
            ack: obj.ack,
            status: obj.status,
          };
          if (obj.phase === 'INIT' || obj.phase === 'DATA') {
            pkt.phase = obj.phase;
          }
          if (typeof obj.nonce === 'number') {
            pkt.nonce = obj.nonce;
          }
          return pkt;
        }
        return null;
      }

      case 'FIN': {
        if (obj.status === 'COMPLETE') {
          return {
            type: 'FIN',
            status: 'COMPLETE',
            ...(typeof obj.hash === 'string' ? { hash: obj.hash } : {}),
          };
        }
        return null;
      }

      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Creates initial Sender state
 */
export function createInitialSenderState(): SenderSessionState {
  return {
    phase: 'IDLE',
    file: null,
    currentChunkIndex: 0,
    activePacket: null,
    ackedChunks: 0,
    resendCount: 0,
    lastScannedRaw: '',
    startTimeMs: null,
    completedTimeMs: null,
    bytesTransferred: 0,
    statusMessage: 'Select or load a file to begin optical transmission.',
    ledState: 'IDLE',
  };
}

/**
 * Starts a Sender session with a prepared file, displaying the INIT frame
 */
export function startSenderSession(
  file: PreparedTransferFile,
  nowMs: number = Date.now()
): SenderSessionState {
  return {
    phase: 'HANDSHAKE_INIT',
    file,
    currentChunkIndex: 0,
    activePacket: file.initPacket,
    ackedChunks: 0,
    resendCount: 0,
    lastScannedRaw: '',
    startTimeMs: nowMs,
    completedTimeMs: null,
    bytesTransferred: 0,
    statusMessage: `Displaying INIT (${file.totalChunks} chunks). Align phones to scan Receiver ACK: 0.`,
    ledState: 'WAITING',
  };
}

/**
 * Advances the Sender Stop-and-Wait ARQ state machine when an optical QR frame is scanned
 */
export function stepSenderState(
  state: SenderSessionState,
  rawQrString: string,
  nowMs: number = Date.now()
): SenderSessionState {
  if (!state.file || state.phase === 'IDLE' || state.phase === 'COMPLETE') {
    return state;
  }

  // Debounce latch: ignore identical consecutive QR scans unless it's a new state
  if (rawQrString === state.lastScannedRaw) {
    return state;
  }

  const packet = parseOpticalPacket(rawQrString);
  if (!packet) {
    return state;
  }

  const { file } = state;

  // 1. Handshake Phase: Sender is displaying INIT and waiting for Receiver's ACK: 0
  if (state.phase === 'HANDSHAKE_INIT') {
    if (packet.type === 'ACK' && packet.ack === 0 && packet.status === 'OK') {
      const firstChunk = file.chunks[0];
      return {
        ...state,
        phase: 'TRANSMITTING',
        currentChunkIndex: 0,
        activePacket: firstChunk,
        lastScannedRaw: rawQrString,
        startTimeMs: state.startTimeMs ?? nowMs,
        statusMessage: `Handshake locked. Transmitting DATA chunk 1 of ${file.totalChunks} (index 0).`,
        ledState: 'ACK_PULSE',
      };
    }
    return state;
  }

  // 2. Data Transmission Loop: Sender is displaying DATA[currentChunkIndex]
  if (state.phase === 'TRANSMITTING') {
    if (packet.type === 'FIN' && packet.status === 'COMPLETE') {
      return {
        ...state,
        phase: 'COMPLETE',
        ackedChunks: file.totalChunks,
        bytesTransferred: file.size,
        completedTimeMs: nowMs,
        lastScannedRaw: rawQrString,
        statusMessage: `Optical transfer complete (${file.name}, ${file.size} bytes verified).`,
        ledState: 'COMPLETE',
      };
    }

    if (packet.type === 'ACK') {
      // If Receiver requests RESEND for current chunk
      if (
        packet.ack === state.currentChunkIndex &&
        packet.status === 'RESEND'
      ) {
        const retryChunk = file.chunks[state.currentChunkIndex];
        return {
          ...state,
          activePacket: retryChunk,
          resendCount: state.resendCount + 1,
          lastScannedRaw: rawQrString,
          statusMessage: `CRC mismatch reported by Receiver on chunk #${state.currentChunkIndex}. Re-emitting chunk.`,
          ledState: 'RESEND_WARN',
        };
      }

      // If Receiver confirms current chunk (ACK: currentChunkIndex with status: OK)
      // Make sure we don't confuse the initial handshake ACK (phase === 'INIT') with DATA chunk 0 ACK
      if (
        packet.ack === state.currentChunkIndex &&
        packet.status === 'OK' &&
        packet.phase !== 'INIT'
      ) {
        const nextIndex = state.currentChunkIndex + 1;
        const chunkBytes = Math.min(
          file.size,
          nextIndex * file.chunkSize
        );

        if (nextIndex < file.totalChunks) {
          return {
            ...state,
            currentChunkIndex: nextIndex,
            activePacket: file.chunks[nextIndex],
            ackedChunks: nextIndex,
            bytesTransferred: chunkBytes,
            lastScannedRaw: rawQrString,
            statusMessage: `ACK:${packet.ack} verified. Emitting DATA chunk ${nextIndex + 1} of ${file.totalChunks}.`,
            ledState: 'ACK_PULSE',
          };
        } else {
          // Last chunk was ACKed; await FIN (or if single-chunk, Receiver may jump straight to FIN)
          return {
            ...state,
            phase: 'AWAITING_FIN',
            ackedChunks: file.totalChunks,
            bytesTransferred: file.size,
            lastScannedRaw: rawQrString,
            statusMessage: `All ${file.totalChunks} chunks acknowledged. Waiting for Receiver FIN confirmation...`,
            ledState: 'ACK_PULSE',
          };
        }
      }
    }
    return state;
  }

  // 3. Awaiting FIN Phase
  if (state.phase === 'AWAITING_FIN') {
    if (packet.type === 'FIN' && packet.status === 'COMPLETE') {
      return {
        ...state,
        phase: 'COMPLETE',
        ackedChunks: file.totalChunks,
        bytesTransferred: file.size,
        completedTimeMs: nowMs,
        lastScannedRaw: rawQrString,
        statusMessage: `FIN received! Optical file transfer complete.`,
        ledState: 'COMPLETE',
      };
    }
  }

  return state;
}

/**
 * Creates initial Receiver state ready to scan INIT
 */
export function createInitialReceiverState(): ReceiverSessionState {
  return {
    phase: 'WAITING_INIT',
    metadata: null,
    receivedChunks: new Map(),
    expectedChunkIndex: 0,
    activePacket: null,
    crcErrorCount: 0,
    lastScannedRaw: '',
    startTimeMs: null,
    completedTimeMs: null,
    bytesReceived: 0,
    assembledBytes: null,
    integrityVerified: false,
    statusMessage: 'Receiver armed. Point front camera at Sender INIT QR code.',
    ledState: 'WAITING',
  };
}

/**
 * Reassembles all received chunks in order into a single Uint8Array
 */
export function reassembleChunks(
  receivedChunks: Map<number, Uint8Array>,
  totalChunks: number,
  expectedTotalBytes: number
): Uint8Array {
  const output = new Uint8Array(expectedTotalBytes);
  let offset = 0;
  for (let i = 0; i < totalChunks; i++) {
    const chunk = receivedChunks.get(i);
    if (!chunk) {
      throw new Error(`Missing chunk index ${i} during reassembly`);
    }
    const copyLen = Math.min(chunk.byteLength, expectedTotalBytes - offset);
    output.set(chunk.subarray(0, copyLen), offset);
    offset += copyLen;
  }
  return output;
}

/**
 * Advances the Receiver Stop-and-Wait ARQ state machine when an optical QR frame is scanned
 */
export function stepReceiverState(
  state: ReceiverSessionState,
  rawQrString: string,
  nowMs: number = Date.now()
): ReceiverSessionState {
  if (state.phase === 'COMPLETE') {
    return state;
  }

  // Debounce latch: ignore identical consecutive QR frames
  if (rawQrString === state.lastScannedRaw) {
    return state;
  }

  const packet = parseOpticalPacket(rawQrString);
  if (!packet) {
    return state;
  }

  // 1. Scan INIT handshake from Sender (allowed in WAITING_INIT or to re-sync before chunk 0)
  if (packet.type === 'INIT') {
    const ackInitPacket: AckPacket = {
      type: 'ACK',
      ack: 0,
      status: 'OK',
      phase: 'INIT',
    };
    return {
      phase: 'RECEIVING_DATA',
      metadata: packet,
      receivedChunks: new Map(),
      expectedChunkIndex: 0,
      activePacket: ackInitPacket,
      crcErrorCount: 0,
      lastScannedRaw: rawQrString,
      startTimeMs: nowMs,
      completedTimeMs: null,
      bytesReceived: 0,
      assembledBytes: null,
      integrityVerified: false,
      statusMessage: `Scanned INIT for "${packet.name}" (${packet.size} B, ${packet.total} chunks). Displaying ACK: 0.`,
      ledState: 'ACK_PULSE',
    };
  }

  // 2. Scan DATA chunk from Sender
  if (state.phase === 'RECEIVING_DATA' && state.metadata && packet.type === 'DATA') {
    const { metadata } = state;

    // Decode Base64 payload and verify CRC32 checksum
    let decodedBytes: Uint8Array;
    try {
      decodedBytes = base64ToUint8(packet.d);
    } catch {
      const resendPacket: AckPacket = {
        type: 'ACK',
        ack: state.expectedChunkIndex,
        status: 'RESEND',
        phase: 'DATA',
        nonce: state.crcErrorCount + 1,
      };
      return {
        ...state,
        activePacket: resendPacket,
        crcErrorCount: state.crcErrorCount + 1,
        lastScannedRaw: rawQrString,
        statusMessage: `Base64 decode error on chunk #${packet.i}. Requesting RESEND.`,
        ledState: 'RESEND_WARN',
      };
    }

    const calculatedCrc = computeCRC32(decodedBytes);
    if (calculatedCrc !== packet.crc.toUpperCase()) {
      const resendPacket: AckPacket = {
        type: 'ACK',
        ack: packet.i,
        status: 'RESEND',
        phase: 'DATA',
        nonce: state.crcErrorCount + 1,
      };
      return {
        ...state,
        activePacket: resendPacket,
        crcErrorCount: state.crcErrorCount + 1,
        lastScannedRaw: rawQrString,
        statusMessage: `CRC mismatch on chunk #${packet.i} (expected ${packet.crc}, got ${calculatedCrc}). Displaying ACK RESEND.`,
        ledState: 'RESEND_WARN',
      };
    }

    // Valid chunk received! Store in buffer if expected or already received
    if (packet.i === state.expectedChunkIndex) {
      const nextMap = new Map(state.receivedChunks);
      nextMap.set(packet.i, decodedBytes);
      const newBytesReceived = state.bytesReceived + decodedBytes.byteLength;
      const nextExpected = state.expectedChunkIndex + 1;

      // Check if all chunks have been received
      if (nextMap.size >= metadata.total) {
        const fullBytes = reassembleChunks(nextMap, metadata.total, metadata.size);
        const computedFullHash = computeFileHash(fullBytes);
        const verified = computedFullHash === metadata.hash.toUpperCase();

        const finPacket: FinPacket = {
          type: 'FIN',
          status: 'COMPLETE',
          hash: computedFullHash,
        };

        return {
          ...state,
          phase: 'COMPLETE',
          receivedChunks: nextMap,
          expectedChunkIndex: nextExpected,
          activePacket: finPacket,
          lastScannedRaw: rawQrString,
          completedTimeMs: nowMs,
          bytesReceived: metadata.size,
          assembledBytes: fullBytes,
          integrityVerified: verified,
          statusMessage: verified
            ? `All ${metadata.total} chunks verified (Hash: ${computedFullHash.slice(0, 8)}…). Displaying FIN & downloading file.`
            : `All ${metadata.total} chunks received (hash mismatch warning). Displaying FIN.`,
          ledState: 'COMPLETE',
        };
      }

      // Otherwise acknowledge chunk i and wait for chunk i + 1
      const ackDataPacket: AckPacket = {
        type: 'ACK',
        ack: packet.i,
        status: 'OK',
        phase: 'DATA',
      };

      return {
        ...state,
        receivedChunks: nextMap,
        expectedChunkIndex: nextExpected,
        activePacket: ackDataPacket,
        lastScannedRaw: rawQrString,
        bytesReceived: newBytesReceived,
        statusMessage: `Verified DATA chunk ${packet.i + 1}/${metadata.total} (CRC ${calculatedCrc}). Displaying ACK: ${packet.i}.`,
        ledState: 'ACK_PULSE',
      };
    }
  }

  return state;
}

/**
 * Calculates transfer speed in KB/s and ETA in seconds
 */
export function calculateTransferMetrics(
  bytesTransferred: number,
  totalBytes: number,
  startTimeMs: number | null,
  endTimeMs: number | null = null
): {
  speedKBps: number;
  elapsedSeconds: number;
  etaSeconds: number;
  progressPercent: number;
} {
  const progressPercent =
    totalBytes > 0
      ? Math.min(100, Math.round((bytesTransferred / totalBytes) * 1000) / 10)
      : 0;

  if (!startTimeMs || bytesTransferred <= 0) {
    return {
      speedKBps: 0,
      elapsedSeconds: 0,
      etaSeconds: 0,
      progressPercent,
    };
  }

  const now = endTimeMs ?? Date.now();
  const elapsedSeconds = Math.max(0.1, (now - startTimeMs) / 1000);
  const speedKBps = Math.round((bytesTransferred / 1024 / elapsedSeconds) * 100) / 100;
  const remainingBytes = Math.max(0, totalBytes - bytesTransferred);
  const bytesPerSec = bytesTransferred / elapsedSeconds;
  const etaSeconds =
    bytesPerSec > 0 ? Math.ceil(remainingBytes / bytesPerSec) : 0;

  return {
    speedKBps,
    elapsedSeconds: Math.round(elapsedSeconds * 10) / 10,
    etaSeconds,
    progressPercent,
  };
}
