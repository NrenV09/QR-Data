import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCRC32,
  computeFileHash,
  prepareFileForOpticalTransfer,
  serializePacket,
  parseOpticalPacket,
  startSenderSession,
  stepSenderState,
  createInitialReceiverState,
  stepReceiverState,
  calculateTransferMetrics,
} from './opticalProtocol';

test('CRC32 and file hash produce deterministic uppercase hex digests', () => {
  const sample = new TextEncoder().encode('Optical ARQ Stop-and-Wait Test Payload');
  const crc1 = computeCRC32(sample);
  const crc2 = computeCRC32(sample);
  assert.equal(crc1, crc2);
  assert.equal(crc1.length, 8);

  const hash1 = computeFileHash(sample);
  const hash2 = computeFileHash(sample);
  assert.equal(hash1, hash2);
  assert.equal(hash1.length, 24);
});

test('prepareFileForOpticalTransfer splits file into accurate chunk sizes and valid packets', () => {
  const rawBytes = new Uint8Array(1050);
  for (let i = 0; i < rawBytes.length; i++) {
    rawBytes[i] = i % 256;
  }

  const prepared = prepareFileForOpticalTransfer(
    'telemetry-calibration.bin',
    'application/octet-stream',
    rawBytes,
    300
  );

  assert.equal(prepared.totalChunks, 4); // 300 + 300 + 300 + 150
  assert.equal(prepared.chunks.length, 4);
  assert.equal(prepared.initPacket.type, 'INIT');
  assert.equal(prepared.initPacket.total, 4);
  assert.equal(prepared.initPacket.size, 1050);
});

test('Full Stop-and-Wait Optical ARQ handshake, chunk loop, CRC error recovery, and FIN completion', () => {
  const textPayload =
    'Stop-and-Wait Optical ARQ bidirectional camera-to-screen transfer payload across multiple QR frames. '.repeat(
      8
    );
  const rawBytes = new TextEncoder().encode(textPayload);
  const prepared = prepareFileForOpticalTransfer(
    'optical-spec.txt',
    'text/plain',
    rawBytes,
    250
  );

  assert.ok(prepared.totalChunks >= 3);

  let sender = startSenderSession(prepared, 1000);
  let receiver = createInitialReceiverState();

  // Step 1: Sender displays INIT -> Receiver scans INIT and displays ACK: 0
  assert.equal(sender.phase, 'HANDSHAKE_INIT');
  assert.equal(sender.activePacket?.type, 'INIT');

  const initRaw = serializePacket(sender.activePacket!);
  receiver = stepReceiverState(receiver, initRaw, 1100);
  assert.equal(receiver.phase, 'RECEIVING_DATA');
  assert.equal(receiver.activePacket?.type, 'ACK');
  if (receiver.activePacket?.type === 'ACK') {
    assert.equal(receiver.activePacket.ack, 0);
    assert.equal(receiver.activePacket.status, 'OK');
  }

  // Step 2: Sender scans Receiver's ACK: 0 -> Sender displays DATA: chunk 0
  const ackInitRaw = serializePacket(receiver.activePacket!);
  sender = stepSenderState(sender, ackInitRaw, 1200);
  assert.equal(sender.phase, 'TRANSMITTING');
  assert.equal(sender.currentChunkIndex, 0);
  assert.equal(sender.activePacket?.type, 'DATA');

  // Verify debounce latch: scanning the same ACK frame again does not advance Sender to chunk 1!
  const senderAfterDuplicateScan = stepSenderState(sender, ackInitRaw, 1250);
  assert.equal(senderAfterDuplicateScan.currentChunkIndex, 0);

  // Step 3: Simulate corrupted CRC on chunk 0 scan at Receiver -> Receiver emits ACK RESEND
  const corruptedChunk0 = {
    ...prepared.chunks[0],
    crc: 'DEADBEEF',
  };
  receiver = stepReceiverState(
    receiver,
    serializePacket(corruptedChunk0),
    1300
  );
  assert.equal(receiver.crcErrorCount, 1);
  assert.equal(receiver.activePacket?.type, 'ACK');
  if (receiver.activePacket?.type === 'ACK') {
    assert.equal(receiver.activePacket.status, 'RESEND');
    assert.equal(receiver.activePacket.ack, 0);
  }

  // Sender scans ACK RESEND -> increments resendCount and stays on chunk 0
  sender = stepSenderState(sender, serializePacket(receiver.activePacket!), 1400);
  assert.equal(sender.resendCount, 1);
  assert.equal(sender.currentChunkIndex, 0);

  // Step 4: Transmit all chunks cleanly in Stop-and-Wait loop
  for (let i = 0; i < prepared.totalChunks; i++) {
    assert.equal(sender.currentChunkIndex, i);
    const dataRaw = serializePacket(sender.activePacket!);
    receiver = stepReceiverState(receiver, dataRaw, 1500 + i * 200);

    if (i < prepared.totalChunks - 1) {
      assert.equal(receiver.phase, 'RECEIVING_DATA');
      assert.equal(receiver.activePacket?.type, 'ACK');
      const ackRaw = serializePacket(receiver.activePacket!);
      sender = stepSenderState(sender, ackRaw, 1600 + i * 200);
    } else {
      // On final chunk, Receiver verifies full file integrity and emits FIN!
      assert.equal(receiver.phase, 'COMPLETE');
      assert.equal(receiver.integrityVerified, true);
      assert.equal(receiver.activePacket?.type, 'FIN');
      const finRaw = serializePacket(receiver.activePacket!);
      sender = stepSenderState(sender, finRaw, 1600 + i * 200);
    }
  }

  assert.equal(sender.phase, 'COMPLETE');
  assert.ok(receiver.assembledBytes);
  const decodedString = new TextDecoder().decode(receiver.assembledBytes!);
  assert.equal(decodedString, textPayload);

  const metrics = calculateTransferMetrics(
    sender.bytesTransferred,
    prepared.size,
    1000,
    3000
  );
  assert.equal(metrics.progressPercent, 100);
  assert.ok(metrics.speedKBps > 0);
});

test('parseOpticalPacket rejects malformed or unrecognized QR payloads safely', () => {
  assert.equal(parseOpticalPacket('https://example.com'), null);
  assert.equal(parseOpticalPacket('{"type":"UNKNOWN"}'), null);
  assert.equal(parseOpticalPacket('{corrupted json'), null);
});
