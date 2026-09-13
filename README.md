# Distributed File Storage System

A fault-tolerant distributed file storage system with dynamic data replication and automatic node recovery. Built as a BE final-year project.

## Architecture

```
React Frontend (:3000)
       │
       ▼
Express Backend / Coordinator (:4000)
       │
       ├── MySQL (:3306)   — metadata, file records
       ├── Redis (:6379)   — cache, node state
       │
       └── Storage Node Pool
           ├── Node 1 (:5001)
           ├── Node 2 (:5002)
           ├── Node 3 (:5003)
           └── Node 4 (:5004)
```

### Component Roles

| Component | Role |
|-----------|------|
| **Frontend** | React + TypeScript UI for file management |
| **Backend** | Coordinator — routes requests, manages metadata, orchestrates storage |
| **MySQL** | Persistent metadata storage (file records, node registry, replication state) |
| **Redis** | Caching layer and ephemeral state (node heartbeats, session data) |
| **Storage Nodes** | Independent services that store actual file data on local volumes |

## Folder Structure

```
distributed_file_storage/
├── frontend/                  # React + Vite + TypeScript
│   ├── src/
│   │   ├── api/               # API client
│   │   ├── pages/             # Page components
│   │   ├── App.tsx            # Root component
│   │   └── main.tsx           # Entry point
│   ├── Dockerfile
│   └── .env.example
│
├── backend/                   # Express.js + TypeScript (Coordinator)
│   ├── src/
│   │   ├── config/            # DB, Redis, app configuration
│   │   ├── middleware/        # Error handling, etc.
│   │   ├── routes/            # API routes
│   │   ├── types/             # TypeScript interfaces
│   │   └── index.ts           # Entry point
│   ├── Dockerfile
│   └── .env.example
│
├── storage-node/              # Express.js + TypeScript (Storage Service)
│   ├── src/
│   │   ├── config/            # Node configuration
│   │   ├── routes/            # Health & file routes
│   │   ├── types/             # TypeScript interfaces
│   │   └── index.ts           # Entry point
│   ├── Dockerfile
│   └── .env.example
│
├── docker-compose.yml         # Orchestrates all 8 services
├── .env.example               # Root environment template
└── README.md                  # This file
```

## Prerequisites

- [Docker](https://www.docker.com/) (v20+)
- [Docker Compose](https://docs.docker.com/compose/) (v2+)
- [Node.js](https://nodejs.org/) (v18+ for local development)

## Quick Start

### 1. Clone & Configure

```bash
git clone <repository-url>
cd distributed_file_storage

# Copy environment files
cp .env.example .env
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
cp storage-node/.env.example storage-node/.env
```

### 2. Start with Docker Compose

```bash
# Build and start all services
docker compose up --build -d

# Check status
docker compose ps

# View logs
docker compose logs -f
```

### 3. Verify

| Service | URL | Expected |
|---------|-----|----------|
| Frontend | http://localhost:3000 | React dashboard |
| Backend Health | http://localhost:4000/api/health | JSON status |
| Node Status | http://localhost:4000/api/nodes | All 4 nodes |
| Storage Node 1 | http://localhost:5001/health | Node 1 status |
| Storage Node 2 | http://localhost:5002/health | Node 2 status |
| Storage Node 3 | http://localhost:5003/health | Node 3 status |
| Storage Node 4 | http://localhost:5004/health | Node 4 status |

### 4. Stop

```bash
docker compose down

# To also remove volumes (storage data):
docker compose down -v
```

## Local Development (without Docker)

```bash
# Backend
cd backend
npm install
npm run dev

# Storage Node (run multiple instances with different ports)
cd storage-node
NODE_ID=node-1 PORT=5001 npm run dev

# Frontend
cd frontend
npm install
npm run dev
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, TypeScript, Vite |
| Backend | Node.js, Express.js, TypeScript |
| Database | MySQL 8.0 (mysql2 driver) |
| Cache | Redis 7 (ioredis) |
| Storage | Node.js Express services |
| Containerization | Docker, Docker Compose |

## Assumptions

1. All services run on a single Docker bridge network for inter-service communication.
2. No reverse proxy (Nginx/Traefik) sits in front of the backend in development.
3. Storage nodes are stateless services — file metadata lives in MySQL, raw data on volumes.
4. No authentication, encryption, or production hardening in the initial scaffold.
5. No ORM — raw SQL queries via mysql2 for transparency and learning.

## Roadmap

- [x] Project scaffolding & Docker Compose
- [ ] File upload with chunking
- [ ] Dynamic data replication across nodes
- [ ] Node heartbeat monitoring
- [ ] Fault detection & automatic recovery
- [ ] Authentication & authorization
- [ ] File download & reassembly
- [ ] Dashboard with real-time node status

## License

This project is part of a BE final-year academic submission.
