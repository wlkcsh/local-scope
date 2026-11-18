"""
Smoke test script for verifying demoparser2 method signatures, columns, and properties
against real CS2 demos per SPEC §3.1.
"""

import sys
from pathlib import Path
from demoparser2 import DemoParser

def run_smoke_test(demo_path: str):
    p = Path(demo_path)
    if not p.exists():
        print(f"Error: Demo file not found at {demo_path}")
        sys.exit(1)

    print(f"=== Running demoparser2 Smoke Test on {p.name} ===")
    parser = DemoParser(str(p))

    # 1. Inspect DemoParser methods
    print("\n--- 1. DemoParser Methods ---")
    methods = [m for m in dir(DemoParser) if not m.startswith("__")]
    print(methods)

    # 2. Header
    print("\n--- 2. Parse Header ---")
    header = parser.parse_header()
    print(header)

    # 3. Game Events
    print("\n--- 3. Game Events (Sample of available) ---")
    try:
        events = parser.list_game_events()
        print(f"Total game events: {len(events)}")
        sample_events = [e for e in events if any(k in e for k in ["round", "death", "hurt", "blind", "fire", "bomb", "grenade", "inferno"])]
        print("Relevant events:", sample_events[:25])
    except Exception as e:
        print("list_game_events error:", e)

    # 4. Test parse_events vs parse_event
    print("\n--- 4. Test parse_events vs parse_event ---")
    test_events = ["round_announce_match_start", "round_freeze_end", "round_end", "player_death", "player_hurt"]
    try:
        parsed_events = parser.parse_events(
            test_events,
            player=["X", "Y", "Z", "team_num", "velocity_X", "velocity_Y", "is_scoped"],
            other=["total_rounds_played", "is_warmup_period"]
        )
        print(f"parse_events succeeded! Returned {len(parsed_events)} event dataframes.")
        for name, df in parsed_events:
            print(f"  Event '{name}': {len(df)} rows, columns: {list(df.columns)[:10]}")
    except Exception as e:
        print("parse_events error:", e)

    # 5. Test parse_grenades
    print("\n--- 5. Test parse_grenades ---")
    try:
        grenades_df = parser.parse_grenades()
        print(f"parse_grenades returned {type(grenades_df)} with {len(grenades_df)} rows.")
        if len(grenades_df) > 0:
            print("Columns:", list(grenades_df.columns))
            print("Sample row:", grenades_df.iloc[0].to_dict() if hasattr(grenades_df, "iloc") else "polars")
    except Exception as e:
        print("parse_grenades error:", e)

    # 6. Test parse_ticks (including inventory and props)
    print("\n--- 6. Test parse_ticks ---")
    round_ends = parser.parse_event("round_end")
    if not round_ends.empty:
        sample_tick = int(round_ends.iloc[0]["tick"])
        print(f"Testing parse_ticks around tick {sample_tick}")
        
        wanted_props = [
            "X", "Y", "Z", "yaw", "pitch", "health", "is_alive",
            "team_num", "active_weapon_name", "flash_duration", "inventory"
        ]
        
        for prop in wanted_props:
            try:
                tdf = parser.parse_ticks([prop], ticks=[sample_tick])
                print(f"  Prop '{prop}': OK (shape {tdf.shape})")
                if prop in ("inventory", "active_weapon_name") and not tdf.empty:
                    val = tdf[prop].dropna().iloc[0] if len(tdf[prop].dropna()) > 0 else None
                    print(f"    Sample {prop} value: {repr(val)}")
            except Exception as e:
                print(f"  Prop '{prop}': FAILED ({e})")

    print("\n=== Smoke Test Complete ===")

if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "/Users/mac/local-scope/backend/tests/fixtures/sample.dem"
    run_smoke_test(path)
