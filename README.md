# Local-Scope: Self-Hosted CS2 Match Analysis & 2D Radar Replay

A lightweight, self-hosted Counter-Strike 2 match intelligence system and 2D radar replay engine designed for gaming club players on FACEIT.

- **Zero Persistent Raw Demos**: Ingests, sniffs, decompresses, and parses 70–200 MB `.dem` files on the fly, immediately unlinking the raw demo after extracting telemetry.
- **Micro Replay Blobs**: Compact 8 Hz columnar delta-encoded tracks compressed with gzip to `< 100 KB` per match (under the 1.5 MB strict budget).
- **Scope.gg-Style Intelligence**: Mistake detection (unspent utility, team flashes, untraded early deaths), aim mechanics (Time-to-Damage, counter-strafing %), interactive radar callouts, and 60 FPS HTML5 canvas replay viewer with zoom and pan.

---

## 🚀 Local Development (macOS)

### Prerequisites
- **Python**: 3.11 to 3.14 (`uv` recommended)
- **Node.js**: v20+ with `pnpm` (`corepack enable && corepack prepare pnpm@latest --activate`)

### 1. Environment Setup
Create your local environment file:
```bash
cp .env.example .env
```
Fill in your FACEIT API keys and Steam ID (optional for local `.dem` file uploads).

### 2. Backend Setup
```bash
# Set up virtual environment and install dependencies
uv venv .venv --python 3.14
source .venv/bin/activate
cd backend
uv pip install -e .
uv pip install -e ".[dev]"

# Run backend test suite (all 13 tests)
pytest tests/ -v

# Start FastAPI server (runs on port 8000)
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 3. Frontend Setup
```bash
cd frontend

# Install dependencies
pnpm install

# Run unit tests (Vitest)
pnpm test

# Typecheck and production build
pnpm run typecheck
pnpm run build

# Start Next.js development server (runs on port 3000)
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🐳 Docker Compose Deployment

The repository includes a multi-container Docker configuration per SPEC §1:
- **Backend**: Python 3.11-slim, persistent volume for `./data`, and in-memory `tmpfs` volume (`2 GB`) for scratch demo decompression.
- **Frontend**: Multi-stage standalone Next.js production build. Only the frontend port (`3000`) is exposed publicly to the host.

```bash
# Build and launch all services in detached mode
docker compose up --build -d

# Check service health and logs
docker compose ps
docker compose logs -f
```

---

## ☁️ EC2 Production Deployment Guide

Deploying to an AWS EC2 instance (e.g. `t3.medium` or `t4g.medium` running Ubuntu 22.04 / 24.04):

### 1. Install Docker & Compose
```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

### 2. Clone and Configure
```bash
git clone https://github.com/your-username/local-scope.git
cd local-scope

# Configure environment variables
cp .env.example .env
nano .env
```
Ensure `API_TOKEN`, `MY_STEAMID`, and `FACEIT_API_KEY` are configured.

### 3. Build On-Host for Target Architecture
To guarantee native performance and avoid cross-architecture emulation issues with `demoparser2`, build directly on the host instance:
```bash
docker compose build --pull
docker compose up -d
```

---

## 🌐 Hybrid Cloud Deployment (Vercel Frontend + AWS EC2 Backend)

For fast global UI delivery on **Vercel** paired with stateful demo parsing on an **AWS EC2 `t3.small`** (2 GB RAM) instance with free automatic HTTPS via **`sslip.io` + Caddy**:

### 1. Bootstrap AWS EC2 (`t3.small`, Ubuntu 24.04)
```bash
git clone https://github.com/your-username/local-scope.git
cd local-scope
./deploy/aws/bootstrap.sh
newgrp docker
```
The script installs Docker + Compose, creates a **4 GB swapfile** for safe demo parsing on 2 GB RAM, configures UFW (`22`, `80`, `443`), and prints your exact `API_DOMAIN=<dashed-elastic-ip>.sslip.io`.

### 2. Configure `.env` & Launch Backend + Caddy Auto-HTTPS
```bash
cp .env.example .env
nano .env
```
Set at minimum:
```dotenv
API_DOMAIN=<your-dashed-elastic-ip>.sslip.io
CORS_ORIGINS=https://<your-vercel-app>.vercel.app,http://localhost:3000
CORS_ORIGIN_REGEX=^https://local-scope-[a-z0-9-]+\.vercel\.app$
API_TOKEN=<your-strong-random-token>
FACEIT_API_KEY=<your-faceit-api-key>
```
Start the backend stack (using disk-backed `/tmp` tuned for `t3.small`):
```bash
docker compose --env-file .env -f deploy/aws/docker-compose.backend.yml up -d --build
curl https://<your-dashed-elastic-ip>.sslip.io/api/health
```

### 3. Deploy Frontend to Vercel
Import the repository into **Vercel** with **Root Directory** set to `frontend`, and add these Environment Variables:
* `BACKEND_URL` = `https://<your-dashed-elastic-ip>.sslip.io`
* `NEXT_PUBLIC_DIRECT_BACKEND_URL` = `https://<your-dashed-elastic-ip>.sslip.io` *(streams large 70–200 MB `.dem` uploads directly to AWS, bypassing Vercel's 4.5 MB proxy limit)*
* `API_TOKEN` / `NEXT_PUBLIC_API_TOKEN` = `<same token as AWS backend, if configured>`

---

## ⚡ Automated n8n Webhook Integration

You can automate match ingestion so that games played at internet cafes or clubs are analyzed automatically without manual action.

### Workflow Blueprint
1. **Schedule Trigger**: Run every 15–30 minutes during club sessions.
2. **FACEIT API Request**:
   - `GET https://open.faceit.com/data/v4/players/{player_id}/history?game=cs2&limit=5`
   - Header: `Authorization: Bearer <FACEIT_API_KEY>`
3. **Filter**: Check for matches newer than the last polled timestamp.
4. **Local-Scope Ingest Node (HTTP Request)**:
   - **Method**: `POST`
   - **URL**: `https://your-domain.com/api/ingest`
   - **Authentication**: Header Auth (`Authorization: Bearer <API_TOKEN>`)
   - **Body (JSON)**:
     ```json
     {
       "source": "https://www.faceit.com/en/cs2/room/{{ $json.match_id }}"
     }
     ```
5. **Success Response**: Receives `202 Accepted` with `{"job_id": "..."}`. The server downloads, decompresses, parses, commits SQLite/Postgres rows and 8 Hz replay blobs, and deletes the `.dem` file automatically.
