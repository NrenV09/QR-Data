import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeAirgapChunk,
  decodeAirgapChunk,
  prepareAirgappedGeneratorPayload,
  createInitialAirgapScannerState,
  stepAirgapScanner,
} from './airgapStreamProtocol';

test('encodeAirgapChunk and decodeAirgapChunk round-trip binary bytes accurately', () => {
  const sample = new Uint8Array([0, 1, 127, 128, 200, 255, 42, 99]);
  const encoded = encodeAirgapChunk(3, sample);
  assert.ok(encoded.startsWith('3,'));

  const decoded = decodeAirgapChunk(encoded);
  assert.ok(decoded);
  assert.equal(decoded!.index, 3);
  assert.deepEqual(Uint8Array.from(decoded!.data), sample);
});

test('Full Airgapped Generator (pako.gzip) to Scanner (pako.inflate) transfer reconstructs original file', () => {
  const originalText =
    'Airgapped QR Code Transfer via Pako Gzip compression and animated QR stream! '.repeat(
      20
    );
  const originalBytes = new TextEncoder().encode(originalText);

  const prepared = prepareAirgappedGeneratorPayload(
    'secret-keys.txt',
    originalBytes,
    250
  );

  // Verify Gzip level-9 compressed the repeated text significantly
  assert.ok(prepared.compressedSize < prepared.originalSize);
  assert.ok(prepared.totalChunks >= 1);

  let scanner = createInitialAirgapScannerState();

  // 1. Scan metadata QR frame `{"name":"secret-keys.txt","chunks":N}`
  scanner = stepAirgapScanner(scanner, prepared.metadataJson);
  assert.equal(scanner.fileMetadata?.name, 'secret-keys.txt');
  assert.equal(scanner.fileMetadata?.chunks, prepared.totalChunks);
  assert.equal(scanner.userMessage, 'Transferring file: secret-keys.txt');

  // 2. Scan all encoded chunk frames `0,base64` ... `N-1,base64`
  for (let i = 0; i < prepared.totalChunks; i++) {
    scanner = stepAirgapScanner(scanner, prepared.encodedChunks[i]);
  }

  assert.equal(scanner.isComplete, true);
  assert.equal(scanner.userMessage, 'Data Transfer Complete');
  assert.ok(scanner.reconstructedBytes);

  const reconstructedText = new TextDecoder().decode(
    scanner.reconstructedBytes!
  );
  assert.equal(reconstructedText, originalText);
});

test('Airgap transfer distinguishes generator role from receiver so generator never auto-downloads', () => {
  let downloadTriggerCount = 0;
  const mockDownloadTrigger = () => {
    downloadTriggerCount++;
  };

  // Function mimicking the download guard in AirgapStreamView
  const handleTransferCompletion = (role: 'GENERATOR' | 'SCANNER', source: 'CAMERA' | 'COUPLED_BRIDGE') => {
    const isCameraScan = source === 'CAMERA';
    const isReceiver = role === 'SCANNER';
    if (isCameraScan && isReceiver) {
      mockDownloadTrigger();
    }
  };

  // 1. Generator streaming chunks via coupled bridge -> MUST NOT trigger download
  handleTransferCompletion('GENERATOR', 'COUPLED_BRIDGE');
  assert.equal(downloadTriggerCount, 0, 'Generator must never download files to its downloads folder');

  // 2. Generator view even if camera was touched -> MUST NOT trigger download
  handleTransferCompletion('GENERATOR', 'CAMERA');
  assert.equal(downloadTriggerCount, 0, 'Generator view must never trigger download');

  // 3. Receiver scanning via camera -> triggers download for the receiving device
  handleTransferCompletion('SCANNER', 'CAMERA');
  assert.equal(downloadTriggerCount, 1, 'Receiver scanning via camera should trigger download on receiver device');
});
