import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ChunkService } from '../services/chunkService';
import { chunkRepository } from '../repositories/chunkRepository';
import { fileRepository } from '../repositories/fileRepository';

describe('ChunkService Subsystem Tests', () => {
  let chunkService: ChunkService;
  const testDir = path.resolve(__dirname, 'temp_test_chunks');

  beforeAll(async () => {
    chunkService = new ChunkService();
    if (!fs.existsSync(testDir)) {
      await fs.promises.mkdir(testDir, { recursive: true });
    }
  });

  afterAll(async () => {
    if (fs.existsSync(testDir)) {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }
  });

  // Helper to create test files of specified byte size
  function createTestFile(fileName: string, sizeBytes: number): string {
    const filePath = path.join(testDir, fileName);
    // Write pseudo-random deterministic buffer
    const buffer = Buffer.alloc(sizeBytes);
    for (let i = 0; i < sizeBytes; i++) {
      buffer[i] = (i * 31 + 17) % 256;
    }
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  // Helper to read a stream into a Buffer
  async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (d) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  describe('Chunk Planning and Boundary Calculations', () => {
    test('Empty file (0 bytes) returns empty plan', () => {
      const plan = chunkService.calculateChunkPlan(0, 1024);
      expect(plan).toEqual([]);
    });

    test('Negative or zero chunk size throws error', () => {
      expect(() => chunkService.calculateChunkPlan(100, 0)).toThrow();
      expect(() => chunkService.calculateChunkPlan(100, -5)).toThrow();
    });
  });

  describe('Requirement Tests: File Sizes and Chunking Logic', () => {
    // 1. Small file
    test('1. Small file (smaller than chunk size): splits into exactly 1 chunk', async () => {
      const chunkSize = 10 * 1024; // 10 KB chunk size
      const fileSize = 2 * 1024;   // 2 KB file (< chunk size)
      const filePath = createTestFile('small_file.bin', fileSize);

      const plans = chunkService.calculateChunkPlan(fileSize, chunkSize);
      expect(plans).toHaveLength(1);
      expect(plans[0].sequenceNumber).toBe(1);
      expect(plans[0].startByte).toBe(0);
      expect(plans[0].endByte).toBe(fileSize - 1);
      expect(plans[0].size).toBe(fileSize);

      const chunks = await chunkService.splitAndProcess(filePath, 101, { chunkSize });
      expect(chunks).toHaveLength(1);
      expect(chunks[0].sequenceNumber).toBe(1);
      expect(chunks[0].size).toBe(fileSize);
      expect(chunks[0].fileId).toBe(101);
      expect(typeof chunks[0].chunkId).toBe('string');
      expect(chunks[0].chunkId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

      // Verify SHA-256 hash matches entire file
      const fileData = fs.readFileSync(filePath);
      const expectedHash = crypto.createHash('sha256').update(fileData).digest('hex');
      expect(chunks[0].hash).toBe(expectedHash);
    });

    // 2. File exactly equal to chunk size
    test('2. File exactly equal to chunk size: splits into exactly 1 full chunk with no remainder', async () => {
      const chunkSize = 8192; // 8 KB
      const fileSize = 8192;  // Exactly 8 KB
      const filePath = createTestFile('exact_file.bin', fileSize);

      const plans = chunkService.calculateChunkPlan(fileSize, chunkSize);
      expect(plans).toHaveLength(1);
      expect(plans[0].sequenceNumber).toBe(1);
      expect(plans[0].startByte).toBe(0);
      expect(plans[0].endByte).toBe(fileSize - 1);
      expect(plans[0].size).toBe(chunkSize);

      const chunks = await chunkService.splitAndProcess(filePath, 102, { chunkSize });
      expect(chunks).toHaveLength(1);
      expect(chunks[0].sequenceNumber).toBe(1);
      expect(chunks[0].size).toBe(chunkSize);

      const fileData = fs.readFileSync(filePath);
      const expectedHash = crypto.createHash('sha256').update(fileData).digest('hex');
      expect(chunks[0].hash).toBe(expectedHash);
    });

    // 3. File larger than chunk size (exact multiple)
    test('3. File larger than chunk size (exact multiple): splits into multiple equal chunks', async () => {
      const chunkSize = 4096; // 4 KB
      const fileSize = 4096 * 3; // Exactly 12 KB (3 chunks)
      const filePath = createTestFile('larger_exact_multiple.bin', fileSize);

      const plans = chunkService.calculateChunkPlan(fileSize, chunkSize);
      expect(plans).toHaveLength(3);
      expect(plans.map((p) => p.size)).toEqual([4096, 4096, 4096]);
      expect(plans.map((p) => p.sequenceNumber)).toEqual([1, 2, 3]);

      const chunks = await chunkService.splitAndProcess(filePath, 103, { chunkSize });
      expect(chunks).toHaveLength(3);

      // Check unique chunk IDs and sequential numbers
      const chunkIds = new Set(chunks.map((c) => c.chunkId));
      expect(chunkIds.size).toBe(3);
      expect(chunks.map((c) => c.sequenceNumber)).toEqual([1, 2, 3]);
      expect(chunks.map((c) => c.size)).toEqual([4096, 4096, 4096]);
    });

    // 4. File with final partial chunk
    test('4. File with final partial chunk: correctly handles remainder chunk and preserves order', async () => {
      const chunkSize = 5000;
      const fileSize = 12345; // 2 full chunks of 5000 + 1 partial chunk of 2345
      const filePath = createTestFile('partial_chunk_file.bin', fileSize);

      const plans = chunkService.calculateChunkPlan(fileSize, chunkSize);
      expect(plans).toHaveLength(3);
      expect(plans[0]).toEqual({ sequenceNumber: 1, startByte: 0, endByte: 4999, size: 5000 });
      expect(plans[1]).toEqual({ sequenceNumber: 2, startByte: 5000, endByte: 9999, size: 5000 });
      expect(plans[2]).toEqual({ sequenceNumber: 3, startByte: 10000, endByte: 12344, size: 2345 });

      const chunks = await chunkService.splitAndProcess(filePath, 104, { chunkSize });
      expect(chunks).toHaveLength(3);
      expect(chunks[0].size).toBe(5000);
      expect(chunks[1].size).toBe(5000);
      expect(chunks[2].size).toBe(2345); // Final partial chunk!
      expect(chunks[0].sequenceNumber).toBe(1);
      expect(chunks[1].sequenceNumber).toBe(2);
      expect(chunks[2].sequenceNumber).toBe(3);

      // Verify each individual chunk hash against manual byte slice
      const fileBytes = fs.readFileSync(filePath);
      const slice1 = fileBytes.subarray(0, 5000);
      const slice2 = fileBytes.subarray(5000, 10000);
      const slice3 = fileBytes.subarray(10000, 12345);

      expect(chunks[0].hash).toBe(crypto.createHash('sha256').update(slice1).digest('hex'));
      expect(chunks[1].hash).toBe(crypto.createHash('sha256').update(slice2).digest('hex'));
      expect(chunks[2].hash).toBe(crypto.createHash('sha256').update(slice3).digest('hex'));
    });
  });

  describe('Streaming to Storage Nodes & File Order Reconstruction', () => {
    test('Preserves original file bit-for-bit when streaming chunks sequentially', async () => {
      const chunkSize = 2048;
      const fileSize = 7500;
      const filePath = createTestFile('stream_reconstruction.bin', fileSize);
      const originalContent = fs.readFileSync(filePath);

      const streamCollectedBuffers: Buffer[] = [];

      // Pass onChunk callback to verify stream-to-storage-node capability
      await chunkService.splitAndProcess(filePath, 105, {
        chunkSize,
        onChunk: async (chunkInfo, getStream) => {
          const chunkStream = getStream();
          const chunkBuffer = await streamToBuffer(chunkStream);

          // Verify streamed size and hash match chunkInfo
          expect(chunkBuffer.length).toBe(chunkInfo.size);
          const computedHash = crypto.createHash('sha256').update(chunkBuffer).digest('hex');
          expect(computedHash).toBe(chunkInfo.hash);

          streamCollectedBuffers.push(chunkBuffer);
        },
      });

      // Verify all 4 chunks were streamed
      expect(streamCollectedBuffers).toHaveLength(4);

      // Concatenate streamed chunks in sequence order and verify matches original file
      const reconstructed = Buffer.concat(streamCollectedBuffers);
      expect(reconstructed.length).toBe(fileSize);
      expect(reconstructed.equals(originalContent)).toBe(true);
    });
  });

  describe('Cleanup & Failure Atomicity', () => {
    test('Temporary file is cleaned up after successful processing', async () => {
      const filePath = createTestFile('temp_to_clean.bin', 5000);
      expect(fs.existsSync(filePath)).toBe(true);

      await chunkService.cleanupTempFile(filePath);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    test('Inconsistent metadata prevention: cleans up metadata and temp file on failure', async () => {
      const filePath = createTestFile('failing_upload.bin', 3000);
      const mockFileId = 9999;

      // Mock chunkRepository.createMany to simulate database insertion error
      const originalCreateMany = chunkRepository.createMany;
      const originalDeleteByFileId = chunkRepository.deleteByFileId;
      const originalUpdateStatus = fileRepository.updateStatus;

      let deleteByFileIdCalledWith: number | null = null;
      let updateStatusCalledWith: { id: number; status: string } | null = null;

      chunkRepository.createMany = jest.fn().mockRejectedValue(new Error('Simulated DB connection failure'));
      chunkRepository.deleteByFileId = jest.fn().mockImplementation(async (id: number) => {
        deleteByFileIdCalledWith = id;
      });
      fileRepository.updateStatus = jest.fn().mockImplementation(async (id: number, status: string) => {
        updateStatusCalledWith = { id, status };
      });

      // Silence expected console.error during simulated failure test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      try {
        await expect(
          chunkService.processUpload(mockFileId, filePath, { chunkSize: 1000, skipDistribution: true })
        ).rejects.toThrow('Simulated DB connection failure');

        // Verify cleanup hooks were triggered
        expect(deleteByFileIdCalledWith).toBe(mockFileId);
        expect(updateStatusCalledWith).toEqual({ id: mockFileId, status: 'failed' });

        // Verify temporary file on disk was unlinked
        expect(fs.existsSync(filePath)).toBe(false);
      } finally {
        consoleSpy.mockRestore();
        // Restore mocks
        chunkRepository.createMany = originalCreateMany;
        chunkRepository.deleteByFileId = originalDeleteByFileId;
        fileRepository.updateStatus = originalUpdateStatus;
      }
    });
  });
});
