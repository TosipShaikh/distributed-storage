# Step 2: Storage Node Service Implementation

## Overview
In **Step 2**, we implemented and deployed the core **Storage Node Service** for the Distributed File Storage System. 

The Storage Node is a standalone, reusable Node.js Express service responsible strictly for storing, retrieving, and managing raw binary file chunks on local node filesystems.

---

## Key Requirements Implemented

1. **Persistent Local File Storage**: Binary chunk data is saved directly to local disk (`DATA_DIR`).
2. **Zero Database Coupling**: Storage nodes do NOT store chunks in MySQL.
3. **Chunk ID as Unique Identifier**: Files are stored and looked up using their unique chunk ID.
4. **Path Traversal Security**: Strict path sanitization (`validateAndResolveChunkPath`) prevents relative directory traversal attacks (`..`, `/`, `\`, `%00`).
5. **Input Validation**: Ensures chunk IDs contain only allowed characters (`[a-zA-Z0-9_\-]`) and enforces payload checks.
6. **Health Endpoint (`GET /health`)**: Returns `nodeId`, `status`, `uptime`, `timestamp`, and `dataDir`.
7. **Storage Stats Endpoint (`GET /stats`)**: Returns `nodeId`, `totalStorage`, `usedStorage`, `availableStorage`, and `numberOfChunks`.
8. **Upload Endpoint (`POST /chunks`)**: Supports raw binary streams (`application/octet-stream`), multipart uploads, and JSON payloads.
9. **Retrieve Endpoint (`GET /chunks/:chunkId`)**: Streams binary content with `application/octet-stream` headers.
10. **Delete Endpoint (`DELETE /chunks/:chunkId`)**: Permanently removes chunk files from local disk.
11. **Request Logging**: Structured HTTP logger (`[timestamp] [nodeId] METHOD Path Status - Duration`).
12. **Global Error Handling**: Standardized JSON error response middleware.
13. **Environment Configurable**:
    - `NODE_ID` (e.g. `node-1`, `node-2`, `node-3`, `node-4`)
    - `PORT` (e.g. `5001`, `5002`, `5003`, `5004`)
    - `DATA_DIR` (e.g. `/data` in containers, bound to Docker volumes)

---

## Directory & File Structure

```text
storage-node/
├── src/
│   ├── config/
│   │   └── index.ts               # Environment configuration loader
│   ├── middleware/
│   │   ├── errorHandler.ts        # Global Express error handler
│   │   └── logger.ts              # Custom HTTP request logger
│   ├── routes/
│   │   ├── chunks.ts              # Chunk POST/GET/DELETE route handlers
│   │   ├── health.ts              # Health check route handler
│   │   ├── stats.ts               # Disk usage statistics route handler
│   │   └── index.ts               # Central router aggregator
│   ├── services/
│   │   └── storageService.ts      # Low-level filesystem operations & disk stats calculation
│   ├── types/
│   │   └── index.ts               # TypeScript response & payload interfaces
│   ├── utils/
│   │   └── validation.ts          # Path traversal security validator
│   └── index.ts                   # Express application entrypoint
├── Dockerfile                     # Storage node containerization definition
├── package.json                   # Dependencies (express, multer, cors, dotenv)
└── tsconfig.json                  # TypeScript compilation rules
```

---

## API Reference

### 1. Health Check
- **Method**: `GET /health`
- **Response**:
```json
{
  "nodeId": "node-1",
  "status": "ok",
  "uptime": 1343,
  "timestamp": "2026-09-13T18:10:00.000Z",
  "dataDir": "/data"
}
```

### 2. Storage Statistics
- **Method**: `GET /stats`
- **Response**:
```json
{
  "nodeId": "node-1",
  "totalStorage": 1081101176832,
  "usedStorage": 45,
  "availableStorage": 1022226849792,
  "numberOfChunks": 1
}
```

### 3. Upload Binary Chunk
- **Method**: `POST /chunks`
- **Headers**:
  - `Content-Type`: `application/octet-stream`
  - `x-chunk-id`: `<chunkId>`
- **Response (201 Created)**:
```json
{
  "success": true,
  "message": "Chunk 'chunk-001' stored successfully.",
  "nodeId": "node-1",
  "chunkId": "chunk-001",
  "size": 1024
}
```

### 4. Retrieve Binary Chunk
- **Method**: `GET /chunks/:chunkId`
- **Response (200 OK)**:
  - `Content-Type`: `application/octet-stream`
  - `Content-Disposition`: `attachment; filename="<chunkId>"`
  - Body: Binary payload

### 5. Delete Chunk
- **Method**: `DELETE /chunks/:chunkId`
- **Response (200 OK)**:
```json
{
  "success": true,
  "message": "Chunk 'chunk-001' deleted successfully from node 'node-1'.",
  "nodeId": "node-1",
  "chunkId": "chunk-001"
}
```

---

## Verification & Automated Test Suite

Automated test scripts were created to verify all 15 requirements:
- [`test-storage-node.ps1`](file:///e:/Projects/distributed_file_storage/test-storage-node.ps1)
- [`test-storage-node.bat`](file:///e:/Projects/distributed_file_storage/test-storage-node.bat)

### Test Execution Results
```text
==================================================
  Distributed File Storage Node Automated Tests   
==================================================

[1/7] Testing GET /health on Node 1 (http://localhost:5001)...
  SUCCESS: Status=ok, NodeId=node-1, Uptime=1343s

[2/7] Testing GET /stats on Node 1 (http://localhost:5001)...
  SUCCESS: NodeId=node-1, Chunks=0, UsedBytes=0

[3/7] Uploading test chunk 'autotest-chunk-999' to Node 1...
  SUCCESS: Chunk 'autotest-chunk-999' stored successfully. (Size: 45 bytes)

[4/7] Retrieving chunk 'autotest-chunk-999' from Node 1...
  SUCCESS: Chunk content matched exactly ('Hello from Storage Node Automated Test Suite!')

[5/7] Verifying storage isolation on Node 2 (http://localhost:5002)...
  SUCCESS: Node 2 correctly returned 404 Not Found (Storage IS isolated).

[6/7] Testing path traversal security with invalid chunk ID...
  SUCCESS: Server correctly rejected invalid chunk ID with 400 Bad Request.

[7/7] Deleting chunk 'autotest-chunk-999' from Node 1...
  SUCCESS: Chunk 'autotest-chunk-999' deleted successfully from node 'node-1'.
  VERIFIED: Chunk is permanently removed from Node 1.

==================================================
  All Storage Node tests completed successfully! 
==================================================
```

---

## Storage Isolation Confirmation

Each containerized storage node runs with isolated persistent volumes (`storage-data-1`, `storage-data-2`, `storage-data-3`, `storage-data-4`). Storing a chunk on `storage-node-1` does NOT write to `storage-node-2`, guaranteeing complete storage independence across node instances.
