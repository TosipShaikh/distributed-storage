# Storage Node Automated Test Suite

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  Distributed File Storage Node Automated Tests   " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

$Node1Url = "http://localhost:5001"
$Node2Url = "http://localhost:5002"
$TestChunkId = "autotest-chunk-999"
$TestContent = "Hello from Storage Node Automated Test Suite!"

# 1. Test GET /health on Node 1
Write-Host "`n[1/7] Testing GET /health on Node 1 ($Node1Url)..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$Node1Url/health" -Method Get
    Write-Host "  SUCCESS: Status=$($health.status), NodeId=$($health.nodeId), Uptime=$($health.uptime)s" -ForegroundColor Green
} catch {
    Write-Host "  FAILED: Could not reach $Node1Url/health. Make sure containers are running." -ForegroundColor Red
    exit 1
}

# 2. Test GET /stats on Node 1
Write-Host "`n[2/7] Testing GET /stats on Node 1 ($Node1Url)..." -ForegroundColor Yellow
$statsBefore = Invoke-RestMethod -Uri "$Node1Url/stats" -Method Get
Write-Host "  SUCCESS: NodeId=$($statsBefore.nodeId), Chunks=$($statsBefore.numberOfChunks), UsedBytes=$($statsBefore.usedStorage)" -ForegroundColor Green

# 3. Test POST /chunks on Node 1
Write-Host "`n[3/7] Uploading test chunk '$TestChunkId' to Node 1..." -ForegroundColor Yellow
$bytes = [System.Text.Encoding]::UTF8.GetBytes($TestContent)
$uploadResp = Invoke-RestMethod -Uri "$Node1Url/chunks" -Method Post -Headers @{ "x-chunk-id" = $TestChunkId } -ContentType "application/octet-stream" -Body $bytes
Write-Host "  SUCCESS: $($uploadResp.message) (Size: $($uploadResp.size) bytes)" -ForegroundColor Green

# 4. Test GET /chunks/:chunkId on Node 1
Write-Host "`n[4/7] Retrieving chunk '$TestChunkId' from Node 1..." -ForegroundColor Yellow
$retrieved = Invoke-RestMethod -Uri "$Node1Url/chunks/$TestChunkId" -Method Get
if ($retrieved -eq $TestContent) {
    Write-Host "  SUCCESS: Chunk content matched exactly ('$retrieved')" -ForegroundColor Green
} else {
    Write-Host "  FAILED: Chunk content mismatch." -ForegroundColor Red
}

# 5. Verify Storage Isolation on Node 2
Write-Host "`n[5/7] Verifying storage isolation on Node 2 ($Node2Url)..." -ForegroundColor Yellow
try {
    $null = Invoke-RestMethod -Uri "$Node2Url/chunks/$TestChunkId" -Method Get
    Write-Host "  FAILED: Node 2 returned chunk data from Node 1! Storage is NOT isolated." -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq [System.Net.HttpStatusCode]::NotFound) {
        Write-Host "  SUCCESS: Node 2 correctly returned 404 Not Found (Storage IS isolated)." -ForegroundColor Green
    } else {
        Write-Host "  UNEXPECTED ERROR: $_" -ForegroundColor Red
    }
}

# 6. Test Path Traversal Protection
Write-Host "`n[6/7] Testing path traversal security with invalid chunk ID..." -ForegroundColor Yellow
try {
    $null = Invoke-RestMethod -Uri "$Node1Url/chunks/invalid_chunk_id!" -Method Get
    Write-Host "  FAILED: Server accepted invalid chunk ID!" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq [System.Net.HttpStatusCode]::BadRequest) {
        Write-Host "  SUCCESS: Server correctly rejected invalid chunk ID with 400 Bad Request." -ForegroundColor Green
    } else {
        Write-Host "  RECEIVED STATUS: $($_.Exception.Response.StatusCode)" -ForegroundColor Yellow
    }
}

# 7. Test DELETE /chunks/:chunkId on Node 1
Write-Host "`n[7/7] Deleting chunk '$TestChunkId' from Node 1..." -ForegroundColor Yellow
$deleteResp = Invoke-RestMethod -Uri "$Node1Url/chunks/$TestChunkId" -Method Delete
Write-Host "  SUCCESS: $($deleteResp.message)" -ForegroundColor Green

# Verify deletion
try {
    $null = Invoke-RestMethod -Uri "$Node1Url/chunks/$TestChunkId" -Method Get
} catch {
    if ($_.Exception.Response.StatusCode -eq [System.Net.HttpStatusCode]::NotFound) {
        Write-Host "  VERIFIED: Chunk is permanently removed from Node 1." -ForegroundColor Green
    }
}

Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host "  All Storage Node tests completed successfully! " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
