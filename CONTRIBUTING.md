# Contributing to Local-Scope

Thank you for your interest in contributing to **Local-Scope**! Local-Scope is a high-throughput, self-hosted Counter-Strike 2 match intelligence system and 60 FPS 2D radar replay engine.

To maintain system stability, sub-100ms parser throughput, and buttery 60 FPS canvas performance, we ask all contributors to follow the engineering standards and guidelines outlined below.

---

## 🛠️ Stack & Tooling

Local-Scope enforces specific modern tooling across the repository:

- **Backend**: Python 3.11–3.14 managed strictly with [uv](https://github.com/astral-sh/uv).
- **Frontend**: Next.js 15 (App Router), React 19, TypeScript, and Tailwind CSS managed strictly with [pnpm](https://pnpm.io/).
- **Testing**:
  - Backend: `pytest` with `pytest-asyncio`
  - Frontend: `vitest`

---

## 💻 Local Development Setup

### 1. Prerequisites
- [uv](https://docs.astral.sh/uv/) (`curl -LsSf https://astral.sh/uv/install.sh | sh` or `brew install uv`)
- [Node.js](https://nodejs.org/) v20+ with `pnpm` (`corepack enable && corepack prepare pnpm@latest --activate`)
- Docker & Docker Compose (optional for local container testing)

### 2. Initial Setup
```bash
# Clone the repository
git clone https://github.com/wlkcsh/local-scope.git
cd local-scope

# Prepare local environment variables
cp .env.example .env
```

### 3. Backend Setup
```bash
# Set up Python virtual environment and dependencies
cd backend
uv venv .venv
source .venv/bin/activate
uv pip install -e ".[dev]"

# Run test suite
pytest tests/ -v

# Run local development server
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 4. Frontend Setup
```bash
cd frontend

# Install dependencies
pnpm install

# Run unit tests
pnpm test

# Run TypeScript typecheck
pnpm run typecheck

# Start development server
pnpm dev
```

---

## 🏛️ Core Engineering & Architecture Rules

When modifying or adding features, you **must** adhere to the following architecture rules:

### Backend & Demo Parsing
1. **Zero Persistent Raw Demos**: Ingested `.dem` files must always be unlinked in a guaranteed `try...finally` block. Never leave temporary demo files on disk.
2. **Worker Process Isolation**: Heavy CPU parsing operations (`demoparser2`) must execute inside the process pool worker (`_run_parse_worker`) to keep the async FastAPI event loop responsive.
3. **SQLAlchemy 2.0 Syntax**: Use modern 2.0-style statements (`select(...)`, typed `Mapped[...]`). Never use legacy 1.x query syntax (`session.query(...)`).
4. **Micro Replay Blob Budget**: Compressed columnar delta-encoded tracks must strictly remain under **1.5 MB** per match (target budget is **< 100 KB**).

### Frontend & Radar Replay Engine
1. **Zero VDOM Re-render Loops**: **NEVER** drive high-frequency animation loops (60 FPS radar replay, timer ticks) through React component state (`useState`, `useReducer`).
2. **The Controller Pattern**: Encapsulate playback timing inside `ReplayClock` and draw loops inside `RadarCanvas`. Drive frame ticks via native `requestAnimationFrame` outside React's render phase.
3. **Zustand Store Subscriptions**: Subscribe to high-frequency state outside React render lifecycles. Only dispatch discrete business events (round change, playback toggle, event selection) back to React.
4. **Deterministic Teardown**: Every `useEffect` that attaches canvas listeners, animation frames, or clock subscriptions must return an explicit cleanup function.

---

## 🔀 Git Workflow & Commit Guidelines

1. **Branch Naming**:
   - `feat/feature-name`
   - `fix/issue-description`
   - `perf/optimization-target`
   - `refactor/component-name`

2. **Conventional Commits**:
   Please follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:
   - `feat(replay): add trajectory trail for thrown smoke grenades`
   - `fix(parser): resolve tick offset on de_ancient sub-tick events`
   - `perf(engine): optimize canvas bounding box calculations for 60 fps`
   - `test(backend): add test for match privacy share link expiration`
   - `docs(readme): clarify Docker tmpfs requirements`

3. **Pull Request Protocol**:
   - Ensure all automated checks pass locally before opening a PR:
     ```bash
     uv run --directory backend pytest tests/ -v
     pnpm --dir frontend test
     pnpm --dir frontend run typecheck
     pnpm --dir frontend run build
     ```
   - Fill out all relevant sections of the Pull Request Template.
