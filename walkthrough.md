# Storage Node Service Implementation Walkthrough

We have fully implemented, deployed, and verified the standalone **Storage Node** service for storing and retrieving binary file chunks.

## Overview of Implemented Features

1. **Configurable Environment Parameters**:
   - `NODE_ID`: Configurable via `NODE_ID` env var (`node-1`, `node-2`, `node-3`, `node-4`).
   - `PORT`: Configurable via `PORT` env var (e.g. `5001`, `5002`, `5003`, `5004`).
   - `DATA_DIR`: Configurable via `DATA_DIR` env var (`/data` in containers, volume-backed).
2. **Direct Binary Filesystem Storage**:
   - Stores raw binary chunk data strictly in `${DATA_DIR}/${chunkId}`. No database or MySQL usage.
3. **Security & Path Traversal Validation**:
   - Strictly validates `chunkId` using safe regex (`/^[a-zA-Z0-9_\-]+$/`) and path resolution check (`path.relative` & `path.resolve`), rejecting relative path traversal attempts (`..`, `/`, `\`, `%00`).
4. **Endpoint API**:
   - `GET /health`: Returns `nodeId`, `status`, `uptime`, `timestamp`, `dataDir`.
   - `GET /stats`: Returns `nodeId`, `totalStorage`, `usedStorage`, `availableStorage`, `numberOfChunks`.
   - `POST /chunks`: Safely receives and stores uploaded binary chunk data. Supports raw `application/octet-stream`, multipart file uploads, and JSON payloads.
   - `GET /chunks/:chunkId`: Retrieves binary chunk with `application/octet-stream` header and attachment filename.
   - `DELETE /chunks/:chunkId`: Removes chunk file from disk.
5. **Request & Error Handling**:
   - Structured JSON logging for all incoming HTTP requests (`[timestamp] [nodeId] METHOD URL STATUS - ms`).
   - Global Express error handling middleware.

---

## File Changes Summary

- [`package.json`](file:///e:/Projects/distributed_file_storage/storage-node/package.json): Added `multer` & `@types/multer`.
- [`src/types/index.ts`](file:///e:/Projects/distributed_file_storage/storage-node/src/types/index.ts): Defined `HealthResponse`, `StatsResponse`, `ChunkUploadResponse`, and `ErrorResponse` interfaces.
- [`src/utils/validation.ts`](file:///e:/Projects/distributed_file_storage/storage-node/src/utils/validation.ts): Path traversal protection and chunk ID sanitizer.
- [`src/services/storageService.ts`](file:///e:/Projects/distributed_file_storage/storage-node/src/services/storageService.ts): File system operations (read/write/delete/stats).
- [`src/middleware/logger.ts`](file:///e:/Projects/distributed_file_storage/storage-node/src/middleware/logger.ts): Request logging middleware.
- [`src/middleware/errorHandler.ts`](file:///e:/Projects/distributed_file_storage/storage-node/src/middleware/errorHandler.ts): Global error response handler.
- [`src/routes/health.ts`](file:///e:/Projects/distributed_file_storage/storage-node/src/routes/health.ts): `GET /health` endpoint handler.
- [`src/routes/stats.ts`](file:///e:/Projects/distributed_file_storage/storage-node/src/routes/stats.ts): `GET /stats` endpoint handler.
- [`src/routes/chunks.ts`](file:///e:/Projects/distributed_file_storage/storage-node/src/routes/chunks.ts): `POST /chunks`, `GET /chunks/:chunkId`, `DELETE /chunks/:chunkId` handlers.
- [`src/routes/index.ts`](file:///e:/Projects/distributed_file_storage/storage-node/src/routes/index.ts): Route registration.
- [`src/index.ts`](file:///e:/Projects/distributed_file_storage/storage-node/src/index.ts): Express initialization with raw/json parsers and middlewares.

---

## Verification & Empirical Test Results

### 1. Health Checks (`GET /health`)

```bash
curl http://localhost:5001/health
curl http://localhost:5002/health
```

**Response (`storage-node-1`)**:
```json
{
  "nodeId": "node-1",
  "status": "ok",
  "uptime": 89,
  "timestamp": "2026-09-13T17:48:50.071Z",
  "dataDir": "/data"
}
```

---

### 2. Node Statistics (`GET /stats`)

```bash
curl http://localhost:5001/stats
```

**Response (`storage-node-1`)**:
```json
{
  "nodeId": "node-1",
  "totalStorage": 1081101176832,
  "usedStorage": 38,
  "availableStorage": 1022226849792,
  "numberOfChunks": 1
}
```

---

### 3. Store Binary Chunk (`POST /chunks`)

```bash
curl -X POST "http://localhost:5001/chunks" \
  -H "x-chunk-id: test-chunk-alpha" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "Hello Distributed File Storage Node 1!"
```

**Response**:
```json
{
  "success": true,
  "message": "Chunk 'test-chunk-alpha' stored successfully.",
  "nodeId": "node-1",
  "chunkId": "test-chunk-alpha",
  "size": 38
}
```

---

### 4. Retrieve Binary Chunk (`GET /chunks/:chunkId`)

```bash
curl -i "http://localhost:5001/chunks/test-chunk-alpha"
```

**Response Headers & Body**:
```http
HTTP/1.1 200 OK
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="test-chunk-alpha"
Content-Length: 38

Hello Distributed File Storage Node 1!
```

---

### 5. Storage Independence Verification (`node-1` vs `node-2`)

Fetching `test-chunk-alpha` (stored on Node 1) from Node 2 (`http://localhost:5002/chunks/test-chunk-alpha`):

```bash
curl -i "http://localhost:5002/chunks/test-chunk-alpha"
```

**Response**:
```http
HTTP/1.1 404 Not Found
Content-Type: application/json; charset=utf-8

{"error":"NOT_FOUND","message":"Chunk 'test-chunk-alpha' not found on node 'node-2'."}
```

> **Storage Isolation Confirmed**: `storage-node-1` and `storage-node-2` maintain completely independent persistent volume directories (`storage-data-1` and `storage-data-2`).

---

### 6. Delete Binary Chunk (`DELETE /chunks/:chunkId`)

```bash
curl -X DELETE "http://localhost:5001/chunks/test-chunk-alpha"
```

**Response**:
```json
{
  "success": true,
  "message": "Chunk 'test-chunk-alpha' deleted successfully from node 'node-1'.",
  "nodeId": "node-1",
  "chunkId": "test-chunk-alpha"
}
```

---

### 7. Path Traversal & Chunk ID Validation

```bash
curl -i "http://localhost:5001/chunks/invalid_chunkId!"
```

**Response**:
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json; charset=utf-8

{"error":"INVALID_CHUNK_ID","message":"Chunk ID must contain only letters, numbers, hyphens (-), and underscores (_)."}
```

---

## Example Usage Reference (curl & Postman)

### 1. Upload a chunk (Raw Binary)
- **Method**: `POST`
- **URL**: `http://localhost:5001/chunks`
- **Headers**:
  - `Content-Type`: `application/octet-stream`
  - `x-chunk-id`: `chunk_abc123`
- **Body**: Binary / raw file content
- **curl command**:
  ```bash
  curl -X POST "http://localhost:5001/chunks" \
    -H "x-chunk-id: chunk_abc123" \
    -H "Content-Type: application/octet-stream" \
    --data-binary "@./my-file-chunk.bin"
  ```

### 2. Upload a chunk (Multipart Form)
- **Method**: `POST`
- **URL**: `http://localhost:5001/chunks`
- **Body (form-data)**:
  - `chunkId`: `chunk_abc123`
  - `file`: Select file
- **curl command**:
  ```bash
  curl -X POST "http://localhost:5001/chunks" \
    -F "chunkId=chunk_abc123" \
    -F "file=@./my-file-chunk.bin"
  ```

### 3. Retrieve a chunk
- **Method**: `GET`
- **URL**: `http://localhost:5001/chunks/chunk_abc123`
- **curl command**:
  ```bash
  curl -O "http://localhost:5001/chunks/chunk_abc123"
  ```

### 4. Delete a chunk
- **Method**: `DELETE`
- **URL**: `http://localhost:5001/chunks/chunk_abc123`
- **curl command**:
  ```bash
  curl -X DELETE "http://localhost:5001/chunks/chunk_abc123"
  ```

### 5. Check Health & Stats
- **Health**: `GET http://localhost:5001/health`
- **Stats**: `GET http://localhost:5001/stats`
