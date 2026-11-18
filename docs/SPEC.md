# Local-Scope: Technical Blueprint

Save this file as `docs/SPEC.md` in the repo; the four agent prompts in §6 reference it by section number.Five things to know before executing:

- **Signed downloads need FACEIT approval.** FACEIT demo CDN URLs normally return 403 when fetched directly. The signed URL comes from the Downloads API, which needs a server-side key with a scope FACEIT grants on request. `
POST /api/ingest/upload` is included as a fallback until you have it.
- **Deleting the `.dem` breaks `demo_gototick` unless you re-download.** On a gaming laptop you must fetch the same demo again; ticks stay valid for the same file. `matches.demo_url` is stored for this, and the UI shows a "Download demo" link next to the copy button.
- **TTD is an approximation.** Exact Time-to-Damage needs line-of-sight raycasts against map geometry. v1 uses the `spotted` flag plus a field-of-view check (§3.5).
- **Job tracking uses `ingest_jobs`.** Parsing takes 20–60 s, so ingest is asynchronous and records job status.
- **`demoparser2` version & gate.** `demoparser2` v0.42.x is available on PyPI (note: macOS Apple Silicon may build from source via Rust/maturin if no prebuilt arm64 wheel is published, or run inside Linux arm64 Docker). Phase 1 starts with `scripts/smoke_demo.py` to verify exact method signatures (`parse_events` vs `parse_event`, `parse_grenades`, and inventory strings) against a real demo before writing parser modules.

## 
1. Repository & File Structure
```local-scope
/
├── docker-compose.yml
├── .env.example                  # FACEIT_API_KEY, FACEIT_DOWNLOAD_KEY, MY_STEAMID, API_TOKEN, DATABASE_URL
├── docs/SPEC.md
├── data/                         # volume: app.db, replays/<match_id>.json.gz
├── backend/
│   
├── Dockerfile                # python:3.11-slim
│   
├── pyproject.toml            # fastapi, uvicorn, demoparser2>=0.42.1, polars, sqlalchemy>=2, pydantic>=2, httpx, zstandard, orjson
│   
├── app/
│   
│   
├── main.py               # app factory, CORS, token auth dependency
│   
│   
├── config.py             # pydantic-settings
│   
│   
├── db.py                 # engine, session, create_all
│   
│   
├── models.py             # SQLAlchemy 2.0 typed models (§2.1)
│   
│   
├── schemas.py            # Pydantic API + ReplayFile models (§2.2)
│   
│   
├── api/{ingest,matches,jobs
}
.py
│   
│   
├── ingest/
│   
│   
│   
├── faceit.py         # URL→match_id, Data API, signed URL
│   
│   
│   
├── download.py       # streaming fetch + decompress
│   
│   
│   
└── pipeline.py       # orchestration + finally-cleanup
│   
│   
└── parser/
│   
│       
├── parser.py         # parse_demo(path) -> ParsedMatch
│   
│       
├── rounds.py         # round table, sides, team A/B
│   
│       
├── frames.py         # 8 Hz tracks, delta/quantize
│   
│       
├── grenades.py
│   
│       
├── highlights.py
│   
│       
├── mistakes.py
│   
│       
├── mechanics.py      # TTD, counter-strafe
│   
│       
├── stats.py          # K/D/A, ADR, KAST, trades
│   
│       
├── maps.py           # calibration table + project()
│   
│       
└── constants.py      # weapon classes, grenade prices
│   
├── scripts/{smoke_demo.py,fetch_radars.py
}
│   
└── tests/{fixtures/,test_parser.py,test_frames.py,test_ingest_cleanup.py
}
└── frontend/
├── Dockerfile                # node:20, output: "standalone"
├── next.config.ts            # rewrites /api/* -> backend
├── public/maps/.png, _lower.png   # 1024×1024 radars
└── src/
├── app/
│   
├── layout.tsx, page.tsx                  # match list + ingest form
│   
└── matches/[id]/
│       
├── page.tsx                          # dashboard (RSC)
│       
└── replay/page.tsx                   # ?round=&tick=
├── components/
│   
├── dashboard/{Scoreboard,MechanicsPanel,RoundTimeline
}
.tsx
│   
├── highlights/{HighlightReel,HighlightCard,CopyCommandButton
}
.tsx
│   
├── mistakes/{MistakeMap,MistakePin,MistakeList
}
.tsx
│   
└── replay/{ReplayPlayer,RadarCanvas,Controls,KillFeed,PlayerList
}
.tsx
├── lib/
│   
├── api.ts, types.ts                      # mirrors §2
│   
├── replay/{decode.ts,interpolate.ts,project.ts,draw.ts,clock.ts
}
│   
└── store.ts                              # zustand
└── styles/globals.css
```

## 
2. Database & Compact JSON Schema

### 2.1 TablesSQLite in WAL mode is the default, which suits a single user and needs no extra service. Postgres works through `DATABASE_URL`. The SQLAlchemy models are the source of truth: `JSON` maps to TEXT on SQLite and JSONB on Postgres.
```sql

CREATE TABLE matches (

  id              TEXT PRIMARY KEY,          -- FACEIT match id "1-<uuid>" or "up-<sha1[:16]>" for uploads
  source          TEXT NOT NULL CHECK (source IN ('faceit','upload')),
  faceit_url      TEXT,
  demo_url        TEXT,                      -- unsigned resource URL, kept for re-download
  map             TEXT NOT NULL,             -- "de_mirage"
  played_at       TIMESTAMP,
  duration_s      INTEGER NOT NULL,
  tick_rate       INTEGER NOT NULL DEFAULT 64,
  rounds_total    INTEGER NOT NULL,
  team_a_name     TEXT NOT NULL, team_b_name TEXT NOT NULL,
  score_a         INTEGER NOT NULL, score_b  INTEGER NOT NULL,
  team_a_first_side TEXT NOT NULL CHECK (team_a_first_side IN ('T','CT')),
  my_steamid      TEXT,
  my_team         TEXT CHECK (my_team IN ('A','B')),
  result          TEXT CHECK (result IN ('W','L','D')),
  replay_path     TEXT NOT NULL,
  replay_bytes    INTEGER NOT NULL,
  parser_version  TEXT NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE player_match_stats (

  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  steamid  TEXT NOT NULL,                    -- steamid64 as TEXT (exceeds JS safe int)
  name     TEXT NOT NULL,
  team     TEXT NOT NULL CHECK (team IN ('A','B')),
  kills INTEGER NOT NULL, deaths INTEGER NOT NULL, assists INTEGER NOT NULL,
  adr REAL NOT NULL, hs_pct REAL NOT NULL, kast_pct REAL NOT NULL,
  first_kills INTEGER NOT NULL, first_deaths INTEGER NOT NULL,
  trade_kills INTEGER NOT NULL, traded_deaths INTEGER NOT NULL,  k3 INTEGER NOT NULL, k4 INTEGER NOT NULL, k5 INTEGER NOT NULL,
  clutches_played INTEGER NOT NULL, clutches_won INTEGER NOT NULL,
  utility_damage INTEGER NOT NULL, enemies_flashed INTEGER NOT NULL,
  flash_assists INTEGER NOT NULL, team_flashes INTEGER NOT NULL,
  shots_fired INTEGER NOT NULL,
  ttd_ms_median REAL,                        -- NULL if < 5 samples
  ttd_samples INTEGER NOT NULL,
  counter_strafe_pct REAL,                   -- NULL if < 20 samples
  counter_strafe_samples INTEGER NOT NULL,  PRIMARY KEY (match_id, steamid)
);

CREATE TABLE highlights (

  id INTEGER PRIMARY KEY,                    -- autoincrement / SERIAL
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  steamid TEXT NOT NULL,
  round INTEGER NOT NULL,                    -- 1-based
  type TEXT NOT NULL CHECK (type IN    ('3k','4k','ace','clutch','spray_transfer','wallbang','smoke_kill','noscope','blind_kill')),
  start_tick INTEGER NOT NULL,               -- first_kill_tick - 192
  end_tick INTEGER NOT NULL,                 -- last_kill_tick + 128
  kill_ticks JSON NOT NULL,                  -- int[]
  weapon TEXT,
  score REAL NOT NULL,                       -- sort weight
  meta JSON NOT NULL                         -- e.g. {"vs":3
}
 for clutch, {"span_ms":1420
}
 for spray
);

CREATE INDEX ix_highlights_match ON highlights(match_id, steamid
);

CREATE TABLE mistakes (

  id INTEGER PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  steamid TEXT NOT NULL,
  round INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('unspent_utility','team_flash','untraded_early_death')),
  tick INTEGER NOT NULL,
  x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL,   -- world coords
  layer INTEGER NOT NULL DEFAULT 0,          -- 0 upper/default, 1 lower
  severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 3),
  meta JSON NOT NULL                         -- {"value":700,"items":[...]
}
 
| {"victim":sid,"duration":2.3
}
 
| {"secs_into_round":9.4,"killer":sid
}
);

CREATE INDEX ix_mistakes_match ON mistakes(match_id, steamid
);

CREATE TABLE ingest_jobs (

  id TEXT PRIMARY KEY,                       -- uuid4
  match_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued','downloading','parsing','done','error')),
  error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

```

### 2.2 Replay file `data/replays/<match_id>.json.gz`The file is columnar, quantised and delta-encoded. Freeze time and dead players are not recorded.
```ts
// frontend/src/lib/types.ts  (Pydantic mirror in backend/app/schemas.py)
type Side = "T" 
| "CT";
type Delta = number[];          // [abs0, d1, d2, ...]  value[i] = value[i-1] + d[i]
type Changes = [number, number][]; // [frame, value] change list, value holds until next entry
interface ReplayFile {

  v: 1;
  match_id: string;
  map: string;
  tick_rate: 64;
  frame_step: 8;                // ticks per frame → 8 Hz; tick = round.t0 + frame*8
  q: { pos: 2; yaw: 3 
}
;        // stored_pos = round(world/2
);
 stored_yaw = round(deg/3) mod 120
  weapons: string[];            // dictionary; widx indexes this
  players: { sid: string; name: string; team: "A" 
| "B" 
}
[];  // pidx = array index (0..9)
  rounds: Round[];
}
interface Round {

  n: number;                    // 1-based  t0: number;                   // demo tick of frame 0 (= freeze_end_tick - 128)
  nf: number;                   // frame count (ends round_end_tick + 192)
  fe: number;                   // frame index of freeze end (normally 16)
  side_a: Side;                 // side of team A this round
  winner: Side;
  reason: string;               // round_end reason
  score: [number, number];      // [A, B] before this round
  p: (Track 
| null)[];          // by pidx; null if not present
  bomb?: { plant?: [number, number, number, number]; // [frame, x, y, pidx] (quantised)         
  defuse?: [number, number];                // [frame, pidx]         
  explode?: number 
}
;                       // frame
  nades: Nade[];
  kills: Kill[];
  shots: [Delta, number[]];     // [frames (delta-encoded), pidx per shot]
}
interface Track {

  n: number;                    // frames alive: arrays cover frames 0..n-1 (ends at death)
  x: Delta; y: Delta;           // quantised world coords
  yaw: Delta;                   // deltas wrapped to [-60, 59]
  hp: Changes;                  // 0..100
  w: Changes;                   // widx of active weapon
  l?: Changes;                  // layer 0|1, only on multi-level maps
  fl?: [number, number][];      // [frame, blind_frames]
}
interface Nade {

  t: "smoke" 
| "flash" 
| "he" 
| "molotov" 
| "decoy";
  p: number;                    // thrower pidx  f0: number;                   // first frame of flight
  x: Delta; y: Delta;           // one point per frame from f0
  det?: [number, number, number, number]; // [frame, x, y, end_frame] (end = expire; flash/he: frame+2)
}
// [frame, killer pidx 
| -1, victim pidx, assister pidx 
| -1, widx, flags]// flags: 1 headshot, 2 wallbang, 4 through-smoke, 8 noscope, 16 attacker-blind, 32 flash-assist
type Kill = [number, number, number, number, number, number];
```
**Size budget.** A 24-round match has about 75 s of live play per round, so 24 × 600 frames × 10 players × roughly 65% alive is about 94k samples of three small deltas each. That should gzip to roughly 400–700 KB, plus under 100 KB for nades, shots and kills.**Enforcement.** Write with `orjson` and `gzip.compress(level=9)`. If the result exceeds 1,500,000 bytes, re-encode with `q={pos:4,yaw:6
}
`. If it is still over, use `frame_step=16`. The header fields make every fallback self-describing.

## 
3. Telemetry & Algorithms (`parser.py`)Constants: `TICK=64`, `PRE=192` (3 s), `POST=128` (2 s), `FRAME=8`.

### 3.1 demoparser2 calls
```pythonp
 = DemoParser(path)map_name = p.parse_header()["map_name"]EVENTS = ["round_announce_match_start","round_freeze_end","round_end","player_death","player_hurt",          "weapon_fire","player_blind","bomb_planted","bomb_defused","bomb_exploded",          "smokegrenade_detonate","smokegrenade_expired","inferno_startburn","inferno_expire",          "flashbang_detonate","hegrenade_detonate","decoy_started"]ev = dict(p.parse_events(EVENTS,          player=["X","Y","Z","team_num","velocity_X","velocity_Y","is_scoped"],          other=["total_rounds_played","is_warmup_period"]))# player props arrive prefixed: user_X, attacker_team_num, ...frames = p.parse_ticks(["X","Y","Z","yaw","health","is_alive","team_num",                        "active_weapon_name","flash_duration"], ticks=frame_ticks)nades  = p.parse_grenades()   # X,Y,Z,tick,thrower_steamid,grenade_type,grenade_entity_id
```

| Event 
| Fields used |
| --- 
| --- |
| `player_death` 
| `attacker_steamid`, `user_steamid`, `assister_steamid`, `weapon`, `headshot`, `penetrated` (>0 is a wallbang), `thrusmoke`, `noscope`, `attackerblind`, `assistedflash` |
| `player_hurt` 
| `attacker_steamid`, `user_steamid`, `dmg_health`, `health`, `weapon` |
| `weapon_fire` 
| `user_steamid`, `weapon`, `user_velocity_X`, `user_velocity_Y` |
| `player_blind` 
| `user_steamid`, `attacker_steamid`, `blind_duration` |
| `round_end` 
| `winner` (handle both `2/3` and `"T"/"CT"`), `reason` |

Normalise weapon names with `removeprefix("weapon_")`. Cast every steamid to `str`.

**Phase-1 gate verification results (`scripts/smoke_demo.py`):**
- `DemoParser` methods verified: `list_game_events`, `list_updated_fields`, `parse_event`, `parse_events`, `parse_grenades`, `parse_header`, `parse_item_drops`, `parse_player_info`, `parse_skins`, `parse_ticks`, `parse_voice`, `parse_weapons`.
- `parse_events`: Returns `List[Tuple[str, pd.DataFrame]]`.
- `parse_grenades`: Returns DataFrame with columns `['grenade_type', 'grenade_entity_id', 'x', 'y', 'z', 'tick', 'steamid', 'name']`. Coordinates `x` and `y` can be `NaN` during flight preparation and are dropped before quantization.
- `parse_ticks(["inventory"])`: Returns Python lists of inventory weapon strings (e.g., `['knife', 'USP-S']`).
- `parse_ticks(["active_weapon_name"])`: Returns weapon string (e.g., `'USP-S'`, `'AK-47'`).
- `player_death`: Columns verified include `assistedflash`, `assister_steamid`, `attacker_steamid`, `user_steamid`, `headshot`, `penetrated`, `thrusmoke`, `noscope`, `attackerblind`, `weapon`.


### 3.2 Rounds, teams and MR12 swaps (`rounds.py`)
1. `live_start` is the last `round_announce_match_start` tick. This discards warmup and the FACEIT knife round.
2. Each `round_end` after `live_start` with a T or CT winner is paired with the latest preceding `round_freeze_end`. Drop rounds without one and rounds flagged `is_warmup_period`. Number the rest 1..N.
3. **Team identity is by steamid, never by side.** At round 1's `freeze_end`, players with `team_num==3` (CT) form team A and those with `team_num==2` (T) form team B. This is fixed for the match.
4. **Side per round is sampled, not computed.** `side_a[n]` is the side of the majority of team A's `team_num` at round n's `freeze_end` tick. This covers the round-13 swap and overtime swaps without hard-coding either.
5. Every side-dependent check (teamkill, team flash, clutch, round winner) compares `team_num` at the event tick, or team A/B via steamid.
6. For a FACEIT source, map faction names onto A/B via `roster[].game_player_id` (a steamid64).

### 3.3 Highlights (`highlights.py`)Valid kills are those where attacker and victim differ and are on different sides at that tick. Each highlight gets `start_tick = first_kill − PRE` and `end_tick = last_kill + POST`.
| Type 
| Rule 
| Score |
| --- 
| --- 
| --- |
| `3k` / `4k` / `ace` 
| 3, 4 or 5 valid kills by one player in a round 
| 3 / 5 / 10 |
| `clutch` 
| See below; `meta.vs = X` 
| 2 + 2·X |
| `spray_transfer` 
| At least 2 consecutive kills, same attacker and weapon, gap ≤ 128 ticks, weapon in `SPRAY_WEAPONS` (rifles, SMGs, LMGs) 
| 2 + n |
| `wallbang` 
| `penetrated > 0` 
| 2 |
| `smoke_kill` 
| `thrusmoke` 
| 2 |
| `noscope` 
| `noscope` and weapon in `{awp, ssg08, scar20, g3sg1
}
` 
| 3 |
| `blind_kill` 
| `attackerblind` 
| 2 |**Clutch.** Walk the round's deaths in order while tracking the alive set per side. The first time a side has exactly one player alive and the other side has X ≥ 1, record `(player, X, tick)`. It counts as won if that side wins the round. The window runs from the clutch tick − PRE to the round-end tick.A multi-kill round absorbs a spray transfer that falls inside it, and the multi-kill row gets `meta.spray=true`.

### 3.4 Mistakes (`mistakes.py`)* **`unspent_utility`.** Fetch `inventory` at `death_tick − 1` for all deaths in one `parse_ticks(["inventory"], ticks=[...])` call. Sum the prices below; if the total exceeds 500, record a mistake. Severity is 1 below $700, 2 below $1000, otherwise 3.* **`team_flash`.** A `player_blind` where attacker and user differ, are on the same side, and `blind_duration > 1.5`. The position is the victim's. Severity 3 if the victim dies within the blind window, otherwise 1.* **`untraded_early_death`.** The death is less than 960 ticks (15 s) after `freeze_end`, and no teammate of the victim kills the killer within 320 ticks (5 s). Severity 2, or 3 if it was also the round's first death.Grenade prices: Smoke Grenade 300, Flashbang 200, High Explosive Grenade 300, Molotov 400, Incendiary Grenade 500, Decoy Grenade 50.

### 3.5 Mechanics (`mechanics.py`)**Counter-strafing %.** Take `weapon_fire` events for bullet weapons, excluding knives, grenades, C4 and the taser. Keep only the first shot of a burst, meaning no shot by the same player in the previous 26 ticks. A shot is good if `hypot(user_velocity_X, user_velocity_Y) < 34`. The percentage is good shots over burst-first shots.**TTD.**
1. An engagement is the first bullet `player_hurt` from A on enemy V with no A→V hurt in the previous 320 ticks.
2. Union the windows `[hurt−128, hurt]` and fetch full-rate ticks `["X","Y","Z","yaw","spotted"]` in one call.
3. `t_seen` is the earliest tick from which, continuously until the hurt, V is `spotted` and the angle between A's yaw and the A→V bearing is at most 45°.
4. `ttd_ms = (hurt − t_seen) / 64 · 1000`. Discard values outside [80, 1500]. Store the median and sample count.

### 3.6 Stats (`stats.py`)* ADR is `min(dmg_health, victim hp before hit)`, enemies only.* A trade is a kill on a teammate's killer within 320 ticks.* KAST uses those kill, assist, survive and traded definitions.

### 3.7 Projection and layers (`maps.py`, `lib/replay/project.ts`)
```px
 = (X - pos_x) / scale          py = (pos_y - Y) / scale      # in 1024×1024 radar spacecanvas = px * (canvasSize / 1024)layer  = 1 if (map has lower_z_max and Z < lower_z_max) else 0
```

| Map 
| pos_x 
| pos_y 
| scale 
| lower_z_max |
| --- 
| --- 
| --- 
| --- 
| --- |
| de_mirage 
| -3230 
| 1713 
| 5.00 
| n/a |
| de_inferno 
| -2087 
| 3870 
| 4.90 
| n/a |
| de_dust2 
| -2476 
| 3239 
| 4.40 
| n/a |
| de_ancient 
| -2953 
| 2164 
| 5.00 
| n/a |
| de_anubis 
| -2796 
| 3328 
| 5.22 
| n/a |
| de_overpass 
| -4831 
| 1781 
| 5.20 
| n/a |
| de_train 
| -2308 
| 2078 
| 4.082 
| n/a |
| de_nuke 
| -3453 
| 2887 
| 7.00 
| -495 |
| de_vertigo 
| -3168 
| 1762 
| 4.00 
| 11700 |`scripts/fetch_radars.py` must fetch authoritative CS2 overview metadata (e.g., `pnxenopoulos/awpy` or `boltgolt/boltobserv`) and overwrite the fallback calibration table above—especially for the updated CS2 `de_train`—saving a generated `backend/app/parser/map_calibration.json` consumed by `maps.py`. It also places `<map>.png` and `<map>_lower.png` (1024×1024) in `frontend/public/maps/`.The layer is computed in the parser and stored in `Track.l` and `mistakes.layer`. The viewer shows one layer at a time, with an Upper/Lower toggle and auto-follow of the selected player. Entities on the other layer are drawn at 25% alpha. Nades use the thrower's layer at `f0`.

### 3.8 Frames (`frames.py`)For each round, `frame_ticks = range(freeze_end − 128, round_end + 192, 8)`.* A track ends at the last frame where the player is `is_alive`.* Quantise, then delta-encode.* Yaw is `round((yaw % 360) / 3) % 120`, with deltas wrapped into [−60, 59].* `hp`, `w` and `l` are change lists.* Grenade paths are `parse_grenades()` rows grouped by `grenade_entity_id` and snapped to frame ticks (if `parse_grenades()` lacks entity IDs or trajectories in the installed version, fall back to grouping by `(thrower_steamid, grenade_type)` within active flight windows).* Detonations come from the events, with the end frame from `smokegrenade_expired` or `inferno_expire`, matched by `entityid`.

## 
4. FACEIT Ingestion & Auto-Cleanup
```

POST /api/ingest {"source": "<room URL 
| match id 
| demo URL>"
}
  → 202 {"job_id"
}

POST /api/ingest/upload (multipart .dem/.dem.gz/.dem.zst)        → 202 {"job_id"
}

GET  /api/jobs/{id
}
                                              → {status, match_id, error
}

GET  /api/matches · 
GET /api/matches/{id
}
 · 
DELETE /api/matches/{id
}

GET  /api/matches/{id
}
/highlights?steamid= · 
GET /api/matches/{id
}
/mistakes?steamid=
GET  /api/matches/{id
}
/replay   → raw .json.gz bytes, headers Content-Type: application/json, Content-Encoding: gzip
```
**Resolve (`faceit.py`).*** A source matching `1-[0-9a-f]{8
}
-(?:[0-9a-f]{4
}
-){3
}
[0-9a-f]{12
}
` is a match id.* Call `GET https://open.faceit.com/data/v4/matches/{id
}
` with `Authorization: Bearer FACEIT_API_KEY`.* Read `demo_url[0]`, `teams.faction{1,2
}
.{name, roster[].game_player_id
}
`, `started_at` and `results`.* A source whose host ends in `faceit-cdn.net` is a direct demo URL, and the match id is extracted from the filename.* If the match already exists, return its id without re-parsing.**Sign.** Call `POST https://open.faceit.com/download/v2/demos/download` with body `{"resource_url": demo_url
}
` and `Authorization: Bearer FACEIT_DOWNLOAD_KEY`. The signed URL is at `payload.download_url`. On 401/403 the job errors with `"download scope missing — use /api/ingest/upload"`.**Download and decompress (`download.py`).*** Use `httpx.stream("GET", signed_url)` with 1 MiB chunks.* Sniff the first 4 bytes: `28 B5 2F FD` is zstd (`zstandard.ZstdDecompressor().decompressobj()`), `1F 8B` is gzip (`zlib.decompressobj(31)`), and `PBDE` is a raw demo.* Write the decompressed chunks straight to `TMP_DIR/<job_id>.dem`. The compressed file never touches disk.* Abort if the output exceeds 1.5 GB. demoparser2 needs a real file path, so allow about 500 MB of scratch space.**Pipeline (`pipeline.py`).** A single worker (`asyncio.Semaphore(1)`) runs the parse in a `ProcessPoolExecutor(max_workers=1)` so the event loop stays free and memory stays bounded.
```pythonasync
 def run_job(job_id: str, source: IngestSource) -> None:    dem = settings.tmp_dir / f"{job_id
}
.dem"  
  try:        meta = await resolve(source)                 # status=downloading        await download_to(dem, meta.signed_url)        parsed = await loop.run_in_executor(pool, parse_demo, str(dem), meta)   # status=parsing        write_replay(parsed)                         # tmp file + os.replace → atomic        persist(parsed)                              # one transaction: match, stats, highlights, mistakes        set_status(job_id, "done", parsed.match_id)  
  except Exception as e:        set_status(job_id, "error", error=str(e)[:500]
);
 raise  
  finally:        dem.unlink(missing_ok=True)                  # guaranteed raw-demo deletion
```
On startup, delete every `*.dem` in `TMP_DIR` (crash recovery) and mark stale non-terminal jobs as `error`. `test_ingest_cleanup.py` asserts the file is gone after success, after a parser exception and after a download abort.All `/api/*` routes require `Authorization: Bearer API_TOKEN` when the variable is set. An n8n webhook can then POST match URLs to `/api/ingest`.

## 
5. Frontend & Canvas Replay Engine

### 5.1 Hierarchy
```
/                       MatchListPage (RSC) ─ IngestForm (client, polls /api/jobs) · MatchCard[]/matches/[id]           MatchDashboard (RSC fetch: match, stats, highlights, mistakes)  ├─ ScoreHeader · PlayerSelect (client; default my_steamid; ?player= in URL)  ├─ Scoreboard (sortable) · MechanicsPanel (TTD, counter-strafe %, trades, KAST)  ├─ RoundTimeline (win/loss pips → link to replay?round=n)  ├─ HighlightReel ─ HighlightCard[] ─ [Watch 2D] [CopyCommandButton] [Download demo]  └─ MistakeMap (radar <img> + absolutely positioned MistakePin[], layer toggle) · MistakeList/matches/[id]/replay    ReplayPlayer (client)  ├─ RadarCanvas (bg canvas + fg canvas) · KillFeed (DOM) · PlayerList (DOM, both teams)  └─ Controls (play/pause, speed 0.5/1/2/4, round select, scrubber with kill/highlight markers, layer toggle)
```
* **`CopyCommandButton`** copies `demo_gototick {start_tick
}
; spec_player "{name
}
"; demo_resume`.* **Watch 2D** links to `replay?round={round
}
&tick={start_tick
}
`. A highlight opened this way auto-pauses at `end_tick`.* **`MistakePin`** is positioned with `project()`. It is coloured by type and sized by severity. Clicking it opens the replay at `tick − 192`.

### 5.2 State
```ts
// zustand: low-frequency UI state only
interface ReplayStore {

  replay: DecodedReplay 
| null;  roundIdx: number; playing: boolean; speed: 0.5 
| 1 
| 2 
| 4;
  layer: 0 
| 1; autoLayer: boolean; selectedPidx: number 
| null;  stopAtTick: number 
| null;  uiFrame: number;                 // throttled copy of playhead (10 Hz) for scrubber/kill feed
}
// high-frequency: clock.ts keeps `playhead` (float frames) in a ref, never in React state
```
`decode.ts` runs once per round, lazily and cached. It prefix-sums the deltas into `Int16Array` x, y and yaw. It expands the change lists into `Uint8Array(nf)` for hp, weapon and layer. It prefix-sums `shots[0]`.

### 5.3 Render loopA `requestAnimationFrame` loop advances the playhead:
```playhead
 += dt_seconds * 8 * speed;   i = floor(playhead
);
  a = playhead - ipos  = lerp(x[i], x[i+1], a) * q.pos → project()         (clamp at track end)yaw  = y0 + shortestArc(y1 - y0) * a  (in 120-step space, ×3°)
```
Layers are drawn in this order:
1. **Background canvas.** The radar image for the active layer. It is redrawn only on resize or layer change.
2. **Smokes.** A grey circle of 144 world units radius at 0.75 alpha, fading over the last 8 frames.
3. **Molotovs.** An orange circle of 120 units radius at 0.45 alpha, with a flicker.
4. **Flash and HE.** An expanding ring over 2 frames.
5. **Nade trails.** A polyline of the last 8 path points with the icon at the interpolated head.
6. **Bomb.** A marker with a pulse after the plant.
7. **Shot tracers.** For each shot in `[playhead−1, playhead]`, a 600-unit line from the shooter along the interpolated yaw, with alpha decaying over one frame.
8. **Kill tracers.** A killer-to-victim line for 4 frames, and an ✕ at the victim's last position for the rest of the round.
9. **Players.*** Dot of radius 7 px, orange for T and blue for CT.* 90° view-cone wedge 28 px long at 0.25 alpha.* HP bar 20×3 px above the dot.* Name and weapon label, at 11 px, for the selected player or when zoom ≥ 1.5.* White ring overlay while blinded.* Selected player gets a 2 px white outline.The canvas is sized by `devicePixelRatio`, and a `ResizeObserver` keeps it square. On phones, scrubbing uses pointer events and tapping a dot selects that player.

## 
6. Prompt Pack

**Phase 1: Parser and map assets**

```
Read docs/SPEC.md fully. Implement backend/ parser only (no API, no DB).
1. Scaffold backend/ per SPEC §1 (pyproject, Python 3.11, demoparser2>=0.42.1 from PyPI, polars, pydantic v2, orjson, pytest).
2. Write scripts/smoke_demo.py per the SPEC §3.1 gate (printing dir(DemoParser), list_game_events(), and inspecting parse_events/parse_event, parse_grenades, and parse_ticks inventory output). Run it on tests/fixtures/sample.dem (ask me for a FACEIT demo if missing). Fix any event/prop/inventory name mismatches in parser/constants.py and record them in docs/SPEC.md §3.1 before continuing.
3. Write scripts/fetch_radars.py and parser/maps.py per SPEC §3.7; fetch authoritative CS2 radar PNGs and overwrite the calibration table (especially de_train) into map_calibration.json.
4. Implement rounds.py (§3.2), frames.py + grenades.py (§3.8, emitting exactly the ReplayFile schema in §2.2 as Pydantic models in app/schemas.py), stats.py (§3.6), highlights.py (§3.3), mistakes.py (§3.4), mechanics.py (§3.5).
5. parser.py exposes parse_demo(path: str, meta: MatchMeta 
| None) -> ParsedMatch {match, player_stats, highlights, mistakes, replay
}
, with fields matching the §2.1 columns.

Done when: pytest passes with tests for delta round-trip, yaw wrap, side_a across the round-13 swap, clutch detection, highlight windows (−192/+128 ticks
);
 and a CLI `python -m app.parser.parser tests/fixtures/sample.dem out/` writes a .json.gz under 1,500,000 bytes and prints stats. Report the actual size and any SPEC deviations.
```

**Phase 2: FastAPI, DB and ingestion**

```
Read docs/SPEC.md. Phase 1 parser exists; do not change its outputs.
1. app/models.py: SQLAlchemy 2.0 typed models exactly matching SPEC §2.1 (5 tables, CHECKs, indexes, cascade). db.py: engine from DATABASE_URL (default sqlite:///data/app.db, WAL), create_all on startup.
2. app/ingest/{faceit,download,pipeline
}
.py exactly per SPEC §4: source resolution, signed download call, magic-byte streaming decompression to TMP_DIR, single-worker process pool, atomic replay write, single-transaction persist, finally-block deletion, startup sweep.
3. API routes per the SPEC §4 endpoint list, with Pydantic response models; /replay streams the stored gzip bytes with Content-Encoding: gzip; bearer API_TOKEN auth; CORS for the frontend origin.
4. config.py via pydantic-settings; .env.example.

Done when: tests/test_ingest_cleanup.py proves the .dem is deleted on success, parser exception, and download abort (mock httpx
);
 
POST /api/ingest/upload with the sample demo produces a done job and all GET endpoints return data; duplicate ingest returns the existing match. Never log or echo keys.
```

**Phase 3: Next.js dashboard and stats UI**

```
Read docs/SPEC.md. Backend runs at http://localhost:8000.
1. Scaffold frontend/ per SPEC §1 (Next.js App Router, TypeScript strict, Tailwind, zustand). next.config rewrites /api/* to BACKEND_URL. lib/types.ts mirrors §2.1 rows and the §2.2 ReplayFile types verbatim; lib/api.ts typed fetchers.
2. Build / (match list, IngestForm polling /api/jobs/{id
}
 every 2 s, upload fallback) and /matches/[id] per the SPEC §5.1 hierarchy: ScoreHeader, PlayerSelect (?player=, default my_steamid), Scoreboard, MechanicsPanel, RoundTimeline, HighlightReel/HighlightCard with CopyCommandButton (exact command string in §5.1) and Download-demo link, MistakeMap with MistakePin positioned via lib/replay/project.ts (§3.7 math, layer toggle on nuke/vertigo), MistakeList.
3. Dark theme, responsive down to 380 px width; Watch-2D links target /matches/[id]/replay?round=&tick= (the page may be a stub).

Done when: `npm run build` and `tsc --noEmit` pass, and the dashboard renders the ingested sample match with pins landing on correct map locations (verify 3 pins visually against known callouts).
```

**Phase 4: Canvas replay viewer and Docker Compose**

```
Read docs/SPEC.md. Implement /matches/[id]/replay per SPEC §5.
1. lib/replay/decode.ts (typed-array decode of §2.2, lazy per round), interpolate.ts (lerp + shortest-arc yaw), clock.ts (rAF playhead in a ref; uiFrame throttled to 10 Hz), draw.ts (the 9 layers in the §5.3 order with the stated radii/sizes), store.ts (§5.2).
2. Components: ReplayPlayer, RadarCanvas (bg + fg canvases, DPR-aware, ResizeObserver), Controls (speed, round select, scrubber with kill/highlight markers, layer toggle + auto-follow), KillFeed, PlayerList. Honor ?round=&tick= and stopAtTick for highlights.
3. Unit-test decode round-trip against a backend-generated fixture and yaw interpolation across the 119→0 wrap.
4. Dockerfiles + docker-compose.yml per §1: backend (uvicorn, volumes ./data:/data, tmpfs or volume for TMP_DIR ≥ 2 GB), frontend (standalone build, BACKEND_URL=http://backend:8000), restart: unless-stopped, healthchecks, only the frontend port published. README with macOS dev commands and EC2 deploy steps (build on host for its architecture, .env, n8n webhook → 
POST /api/ingest example).

Done when: playback holds 60 fps in the Chrome performance panel on a full round, smokes/molotovs/tracers appear at correct positions, nuke layer switching works, and `docker compose up --build` serves the whole app from a clean clone.
```

```

```
