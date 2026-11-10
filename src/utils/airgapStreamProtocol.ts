/**
 * Airgapped QR Code Transfer Protocol Engine (100% wire-compatible with
 * airgapped-qr-code-transfer.mohanram.co.in/generator & /scanner)
 *
 * Uses Pako Gzip (level 9) compression, metadata JSON frame `{"name": file.name, "chunks": total_chunks}`,
 * and comma-delimited indexed chunk frames `"${index},${base64Utf8EncodedChunk}"` with pako.inflate reassembly.
 */

import * as pako from 'pako';

export interface AirgapFileMetadata {
  name: string;
  chunks: number;
}

export interface PreparedAirgapTransfer {
  name: string;
  originalSize: number;
  compressedSize: number;
  compressionRatioPct: number;
  chunkSize: number;
  totalChunks: number;
  metadataJson: string;
  encodedChunks: string[]; // Format: "${i},${base64}"
}

export interface AirgapScannerState {
  isReceiving: boolean;
  userMessage: string;
  fileMetadata: AirgapFileMetadata | null;
  decodedChunks: Record<number, number[]>;
  receivedCount: number;
  isComplete: boolean;
  reconstructedBytes: Uint8Array | null;
  lastScannedRaw: string;
}

const sharedUtf8Encoder = new TextEncoder();
const sharedUtf8Decoder = new TextDecoder();

/**
 * Fast O(1) helper to extract the chunk index prefix from `"index,base64"` without decoding base64.
 */
export function peekAirgapChunkIndex(inputString: string): number | null {
  if (!inputString || typeof inputString !== 'string') return null;
  const commaIdx = inputString.indexOf(',');
  if (commaIdx <= 0 || commaIdx >= 10) return null;
  const index = parseInt(inputString.slice(0, commaIdx), 10);
  if (Number.isNaN(index) || index < 0) return null;
  return index;
}

/**
 * Wire-compatible chunk encoder matching mohanram's `encode_data(index, input_bytes)`:
 * Converts compressed byte slice -> char string -> TextEncoder UTF-8 bytes -> btoa -> `${index},${encoded_data}`
 */
export function encodeAirgapChunk(
  index: number,
  inputBytes: Uint8Array
): string {
  let encodedString = '';
  for (let i = 0; i < inputBytes.length; i++) {
    encodedString += String.fromCharCode(inputBytes[i]);
  }
  const utf8Bytes = sharedUtf8Encoder.encode(encodedString);

  let binaryStr = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binaryStr += String.fromCharCode(utf8Bytes[i]);
  }
  const encodedData =
    typeof btoa === 'function'
      ? btoa(binaryStr)
      : Buffer.from(utf8Bytes).toString('base64');

  return `${index},${encodedData}`;
}

/**
 * Wire-compatible chunk decoder matching mohanram's `decode_data(input_string)`:
 * Parses `${index},${base64}` -> atob -> TextDecoder UTF-8 string -> byte array
 */
export function decodeAirgapChunk(inputString: string): {
  index: number;
  data: number[];
} | null {
  if (!inputString || typeof inputString !== 'string') return null;
  const commaIdx = inputString.indexOf(',');
  if (commaIdx <= 0) return null;

  const index = parseInt(inputString.slice(0, commaIdx), 10);
  const rawBase64 = inputString.slice(commaIdx + 1);
  if (Number.isNaN(index) || index < 0 || !rawBase64 || rawBase64.includes(',')) {
    return null;
  }

  try {
    let encodedArray: Uint8Array;
    if (typeof atob === 'function') {
      const encodedData = atob(rawBase64);
      encodedArray = new Uint8Array(encodedData.length);
      for (let i = 0; i < encodedData.length; i++) {
        encodedArray[i] = encodedData.charCodeAt(i);
      }
    } else {
      encodedArray = new Uint8Array(Buffer.from(rawBase64, 'base64'));
    }

    const outputString = sharedUtf8Decoder.decode(encodedArray);
    const dataArray = new Array<number>(outputString.length);
    for (let i = 0; i < outputString.length; i++) {
      dataArray[i] = outputString.charCodeAt(i);
    }

    return {
      index,
      data: dataArray,
    };
  } catch {
    return null;
  }
}

/**
 * Compresses a file using `pako.gzip(bytes, { level: 9 })` and prepares all QR frames
 * for Data Sender Mode (Generator).
 */
export function prepareAirgappedGeneratorPayload(
  name: string,
  rawBytes: Uint8Array,
  chunkSize: number = 250
): PreparedAirgapTransfer {
  const safeChunkSize = Math.max(64, Math.min(800, Math.floor(chunkSize)));
  const compressedArray = pako.gzip(rawBytes, { level: 9 });
  const totalChunks = Math.max(
    1,
    Math.ceil(compressedArray.length / safeChunkSize)
  );

  const fileMetadata: AirgapFileMetadata = {
    name: name || 'transfer.bin',
    chunks: totalChunks,
  };
  const metadataJson = JSON.stringify(fileMetadata);

  const encodedChunks: string[] = [];
  for (let i = 0; i < totalChunks; i++) {
    const start = i * safeChunkSize;
    const chunk = compressedArray.subarray(start, start + safeChunkSize);
    encodedChunks.push(encodeAirgapChunk(i, chunk));
  }

  const ratio =
    rawBytes.byteLength > 0
      ? Math.round(
          (1 - compressedArray.byteLength / rawBytes.byteLength) * 100
        )
      : 0;

  return {
    name: fileMetadata.name,
    originalSize: rawBytes.byteLength,
    compressedSize: compressedArray.byteLength,
    compressionRatioPct: ratio,
    chunkSize: safeChunkSize,
    totalChunks,
    metadataJson,
    encodedChunks,
  };
}

export function createInitialAirgapScannerState(): AirgapScannerState {
  return {
    isReceiving: false,
    userMessage: 'Click receive button to start receiving',
    fileMetadata: null,
    decodedChunks: {},
    receivedCount: 0,
    isComplete: false,
    reconstructedBytes: null,
    lastScannedRaw: '',
  };
}

/**
 * Processes a scanned QR string in Data Receiver Mode (Scanner).
 * Handles both metadata JSON `{"name":"...","chunks":N}` and data frames `"index,base64"`,
 * automatically inflating the Gzip stream with `pako.inflate` when all chunks arrive.
 */
export function stepAirgapScanner(
  state: AirgapScannerState,
  decodedData: string
): AirgapScannerState {
  if (!decodedData || typeof decodedData !== 'string') return state;
  // Fast O(1) skip if identical frame scanned back-to-back
  if (decodedData === state.lastScannedRaw) return state;

  // 1. Check if frame is the metadata JSON packet containing `"chunks"`
  if (decodedData.includes('"chunks"') && decodedData.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(decodedData);
      if (
        parsed &&
        typeof parsed.name === 'string' &&
        typeof parsed.chunks === 'number' &&
        parsed.chunks > 0
      ) {
        // Fast skip if metadata for the exact same active file is already registered
        if (
          !state.isComplete &&
          state.fileMetadata &&
          state.fileMetadata.name === parsed.name &&
          state.fileMetadata.chunks === parsed.chunks
        ) {
          return state;
        }

        // Preserve any chunks already scanned if the camera joined mid-stream before the metadata frame looped around
        const isDifferentCompletedFile =
          state.isComplete &&
          state.fileMetadata &&
          (state.fileMetadata.name !== parsed.name ||
            state.fileMetadata.chunks !== parsed.chunks);

        const isDifferentActiveFile =
          !state.isComplete &&
          state.fileMetadata &&
          (state.fileMetadata.name !== parsed.name ||
            state.fileMetadata.chunks !== parsed.chunks);

        const preservedChunks: Record<number, number[]> = {};
        if (!isDifferentCompletedFile && !isDifferentActiveFile && !state.isComplete) {
          for (const [k, v] of Object.entries(state.decodedChunks)) {
            const idx = Number(k);
            if (!Number.isNaN(idx) && idx >= 0 && idx < parsed.chunks) {
              preservedChunks[idx] = v;
            }
          }
        }
        const preservedCount = Object.keys(preservedChunks).length;

        // If all chunks 0 .. parsed.chunks - 1 were already captured before metadata arrived, inflate immediately
        if (preservedCount >= parsed.chunks) {
          let allPresent = true;
          const outputArray: number[] = [];
          for (let i = 0; i < parsed.chunks; i++) {
            const chunkArr = preservedChunks[i];
            if (!chunkArr) {
              allPresent = false;
              break;
            }
            for (let b = 0; b < chunkArr.length; b++) {
              outputArray.push(chunkArr[b]);
            }
          }
          if (allPresent) {
            try {
              const inflatedArray = pako.inflate(Uint8Array.from(outputArray));
              return {
                isReceiving: false,
                userMessage: 'Data Transfer Complete',
                fileMetadata: {
                  name: parsed.name,
                  chunks: parsed.chunks,
                },
                decodedChunks: preservedChunks,
                receivedCount: preservedCount,
                isComplete: true,
                reconstructedBytes: inflatedArray,
                lastScannedRaw: decodedData,
              };
            } catch {
              // Fall through to normal metadata initialization if inflate fails
            }
          }
        }

        return {
          isReceiving: true,
          userMessage: `Transferring file: ${parsed.name}`,
          fileMetadata: {
            name: parsed.name,
            chunks: parsed.chunks,
          },
          decodedChunks: preservedChunks,
          receivedCount: preservedCount,
          isComplete: false,
          reconstructedBytes: null,
          lastScannedRaw: decodedData,
        };
      }
    } catch {
      // Not valid JSON metadata
    }
  }

  // 2. Check if frame is a comma-delimited chunk `"index,base64"`
  const peekedIndex = peekAirgapChunkIndex(decodedData);
  if (peekedIndex !== null) {
    // O(1) fast-skip if this chunk index has ALREADY been decoded!
    // Prevents expensive atob/UTF-8 decoding and prevents unnecessary React re-renders during high-FPS scanning.
    if (state.decodedChunks[peekedIndex] !== undefined) {
      return state;
    }

    const rawData = decodeAirgapChunk(decodedData);
    if (!rawData) return state;

    const nextDecodedChunks: Record<number, number[]> = {
      ...state.decodedChunks,
      [rawData.index]: rawData.data,
    };
    const nextReceivedCount = Object.keys(nextDecodedChunks).length;
    const targetChunks = state.fileMetadata?.chunks ?? -1;

    // Check if all chunks 0 .. targetChunks - 1 have been collected
    if (targetChunks > 0 && nextReceivedCount >= targetChunks) {
      let allPresent = true;
      const outputArray: number[] = [];
      for (let i = 0; i < targetChunks; i++) {
        const chunkArr = nextDecodedChunks[i];
        if (!chunkArr) {
          allPresent = false;
          break;
        }
        for (let b = 0; b < chunkArr.length; b++) {
          outputArray.push(chunkArr[b]);
        }
      }

      if (allPresent) {
        try {
          const outputUint8Array = Uint8Array.from(outputArray);
          const inflatedArray = pako.inflate(outputUint8Array);
          return {
            ...state,
            isReceiving: false,
            userMessage: 'Data Transfer Complete',
            decodedChunks: nextDecodedChunks,
            receivedCount: nextReceivedCount,
            isComplete: true,
            reconstructedBytes: inflatedArray,
            lastScannedRaw: decodedData,
          };
        } catch {
          return {
            ...state,
            userMessage: 'Gzip decompression error — retrying stream...',
            decodedChunks: {},
            receivedCount: 0,
            lastScannedRaw: decodedData,
          };
        }
      }
    }

    return {
      ...state,
      isReceiving: true,
      userMessage: state.fileMetadata
        ? `Transferring file: ${state.fileMetadata.name} (Chunk ${rawData.index + 1}/${state.fileMetadata.chunks})`
        : `Captured chunk #${rawData.index} (Waiting for file metadata frame...)`,
      decodedChunks: nextDecodedChunks,
      receivedCount: nextReceivedCount,
      lastScannedRaw: decodedData,
    };
  }

  return state;
}
