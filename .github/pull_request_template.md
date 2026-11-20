## 📋 Description & Context
<!-- Provide a brief summary of the changes and the problem/ticket it addresses. -->

- **Why**: 
- **What**: 

---

## 🏷️ Type of Change
- [ ] 🐛 Bug fix (non-breaking change fixing an issue)
- [ ] ✨ New feature (non-breaking change adding functionality)
- [ ] ⚡ Performance optimization (latency reduction, memory reduction, replay compression)
- [ ] ♻️ Refactoring (no functional changes, code cleanup)
- [ ] 📝 Documentation update
- [ ] 🔧 Build / CI / Tooling change

---

## 🎯 Areas Affected
- [ ] **Backend**: FastAPI routes, SQLAlchemy models, auth, or SQLite queries
- [ ] **CS2 Parser**: `demoparser2` extraction, tick quantization, mechanics calculation
- [ ] **Frontend UI**: Next.js App Router, React 19 components, Tailwind styling
- [ ] **2D Radar Canvas Engine**: Playback clock, frame interpolation, canvas rendering
- [ ] **Infrastructure / Deployment**: Docker Compose, EC2 scripts, environment configs

---

## 🔬 Engineering & Architecture Checklist
<!-- Please ensure all applicable checks are verified before requesting review. -->

- [ ] **Backend Tests**: `uv run --directory backend pytest tests/ -v` passes with 100% green rate.
- [ ] **Frontend Tests**: `pnpm --dir frontend test` passes with 100% green rate.
- [ ] **Strict Typing**: `pnpm --dir frontend run typecheck` (`tsc --noEmit`) passes with zero errors.
- [ ] **Zero Persistent Demos**: Temporary `.dem` files are unlinked in a guaranteed `try...finally` block.
- [ ] **Replay Size Budget**: Columnar delta-encoded tracks remain within the strict `< 1.5 MB` (target `< 100 KB`) budget.
- [ ] **Canvas Performance**: High-frequency ticks run via `requestAnimationFrame` outside React's VDOM render lifecycle.
- [ ] **Resource Cleanup**: All `useEffect` hooks, clocks, and canvas listeners have explicit teardown callbacks.
- [ ] **Security**: No secrets, auth tokens, or private credentials committed.

---

## 📸 Visual Demos / Benchmarks (if applicable)
<!-- Attach screenshots, GIF recordings of the radar canvas, or benchmark logs. -->
