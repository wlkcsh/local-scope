"""
Unit tests for CS2 round extraction, MR12 half-time swaps, highlight detection,
and full demo parsing per SPEC §3.2, §3.3, §6.
"""

from pathlib import Path
import pytest
import pandas as pd
from app.parser.rounds import RoundDescriptor, extract_rounds_and_teams, TeamRoster
from app.parser.highlights import detect_highlights
from app.parser.mistakes import detect_mistakes
from app.parser.mechanics import compute_first_bullet_accuracy
from app.parser.parser import parse_demo, serialize_replay_gzip


def test_highlight_windows_and_multikill():
    """
    Verify highlight detection correctly computes:
    start_tick = first_kill - 192, end_tick = last_kill + 128 (clamped to round bounds).
    """
    round_desc = RoundDescriptor(
        round_num=5,
        start_tick=10000,
        end_tick=20000,
        t0=10000 - 128,
        nf=1250,
        fe=16,
        side_a="CT",
        winner="CT",
        reason="normal",
        score_before=(2, 2),
    )

    player_sid_to_team = {
        "7656001": "A",
        "7656002": "B",
        "7656003": "B",
        "7656004": "B",
    }

    # Simulate 3 kills by 7656001 at ticks 12000, 13000, 14000
    deaths = pd.DataFrame([
        {
            "tick": 12000,
            "attacker_steamid": "7656001",
            "user_steamid": "7656002",
            "weapon": "ak47",
            "headshot": True,
            "penetrated": 0,
            "thrusmoke": False,
            "noscope": False,
            "attackerblind": False,
        },
        {
            "tick": 13000,
            "attacker_steamid": "7656001",
            "user_steamid": "7656003",
            "weapon": "ak47",
            "headshot": False,
            "penetrated": 0,
            "thrusmoke": False,
            "noscope": False,
            "attackerblind": False,
        },
        {
            "tick": 14000,
            "attacker_steamid": "7656001",
            "user_steamid": "7656004",
            "weapon": "ak47",
            "headshot": True,
            "penetrated": 0,
            "thrusmoke": False,
            "noscope": False,
            "attackerblind": False,
        },
    ])

    highlights = detect_highlights("match_1", [round_desc], deaths, player_sid_to_team)
    mk_highlights = [h for h in highlights if h.type in ("3k", "4k", "ace")]
    assert len(mk_highlights) == 1
    hl = mk_highlights[0]
    assert hl.type == "3k"
    assert hl.steamid == "7656001"
    assert hl.start_tick == 12000 - 192  # 11808
    assert hl.end_tick == 14000 + 128    # 14128
    assert hl.score == 3.0
    assert hl.kill_ticks == [12000, 13000, 14000]


def test_clutch_detection():
    """Verify 1vX clutch situation detection and score weighting per SPEC §3.3."""
    round_desc = RoundDescriptor(
        round_num=10,
        start_tick=50000,
        end_tick=60000,
        t0=50000 - 128,
        nf=1250,
        fe=16,
        side_a="CT",
        winner="CT",
        reason="normal",
        score_before=(5, 4),
    )

    player_sid_to_team = {
        "ct_1": "A",
        "ct_2": "A",
        "t_1": "B",
        "t_2": "B",
        "t_3": "B",
    }

    # Death sequence: ct_2 dies first at 52000, leaving ct_1 alone against 3 Ts
    # Then ct_1 eliminates t_1, t_2, t_3
    deaths = pd.DataFrame([
        {
            "tick": 52000,
            "attacker_steamid": "t_1",
            "user_steamid": "ct_2",
            "weapon": "ak47",
            "headshot": False,
            "penetrated": 0,
            "thrusmoke": False,
            "noscope": False,
            "attackerblind": False,
        },
        {
            "tick": 54000,
            "attacker_steamid": "ct_1",
            "user_steamid": "t_1",
            "weapon": "m4a1_silencer",
            "headshot": True,
            "penetrated": 0,
            "thrusmoke": False,
            "noscope": False,
            "attackerblind": False,
        },
        {
            "tick": 55000,
            "attacker_steamid": "ct_1",
            "user_steamid": "t_2",
            "weapon": "m4a1_silencer",
            "headshot": False,
            "penetrated": 0,
            "thrusmoke": False,
            "noscope": False,
            "attackerblind": False,
        },
        {
            "tick": 56000,
            "attacker_steamid": "ct_1",
            "user_steamid": "t_3",
            "weapon": "m4a1_silencer",
            "headshot": True,
            "penetrated": 0,
            "thrusmoke": False,
            "noscope": False,
            "attackerblind": False,
        },
    ])

    highlights = detect_highlights("match_clutch", [round_desc], deaths, player_sid_to_team)
    clutches = [h for h in highlights if h.type == "clutch"]
    assert len(clutches) == 1
    clutch = clutches[0]
    assert clutch.steamid == "ct_1"
    assert clutch.meta["vs"] == 3
    # Score weight: 2 + 2*X = 2 + 6 = 8.0
    assert clutch.score == 8.0
    assert clutch.start_tick == 52000 - 192


def test_side_a_across_round_13_swap():
    """Verify Team A swaps from CT to T at round 13 in MR12 matches."""
    # Synthetic round ends for 15 rounds
    round_ends = []
    freeze_ends = []
    for i in range(1, 16):
        fe = i * 2000
        re = fe + 1500
        freeze_ends.append({"tick": fe})
        round_ends.append({"tick": re, "winner": "CT", "reason": "normal", "is_warmup_period": False})

    events = {
        "round_announce_match_start": pd.DataFrame([{"tick": 500}]),
        "round_freeze_end": pd.DataFrame(freeze_ends),
        "round_end": pd.DataFrame(round_ends),
    }

    # Mock ticks function:
    # Round 1 (tick 2000): team_a (sid '1001') has team_num 3 (CT)
    # Round 13 (tick 26000): team_a (sid '1001') has team_num 2 (T)
    def mock_parse_ticks(props, ticks):
        rows = []
        for tk in ticks:
            # First half: rounds 1-12
            if tk <= 24000:
                rows.append({"tick": tk, "player_steamid": "1001", "player_name": "Alice", "team_num": 3})
                rows.append({"tick": tk, "player_steamid": "2001", "player_name": "Bob", "team_num": 2})
            else:
                # Second half: rounds 13-15 (Team A swaps to T = 2)
                rows.append({"tick": tk, "player_steamid": "1001", "player_name": "Alice", "team_num": 2})
                rows.append({"tick": tk, "player_steamid": "2001", "player_name": "Bob", "team_num": 3})
        return pd.DataFrame(rows)

    rounds, roster, players = extract_rounds_and_teams(events, mock_parse_ticks)
    assert len(rounds) == 15
    # First half rounds (1..12) should have side_a = "CT"
    for r in rounds[:12]:
        assert r.side_a == "CT"
    # Second half rounds (13..15) should have side_a = "T"
    for r in rounds[12:]:
        assert r.side_a == "T"


def test_full_sample_demo_parse():
    """Integration test parsing tests/fixtures/sample.dem."""
    demo_file = Path(__file__).resolve().parent / "fixtures" / "sample.dem"
    if not demo_file.exists():
        pytest.skip("sample.dem fixture not found")

    parsed = parse_demo(str(demo_file))
    assert parsed.match.id.startswith("up-")
    assert parsed.match.rounds_total >= 10
    assert len(parsed.player_stats) >= 5
    assert parsed.match.replay_bytes > 0
    assert parsed.match.replay_bytes <= 1_500_000

    # Test replay file gzip size
    gz_bytes = serialize_replay_gzip(parsed.replay)
    assert len(gz_bytes) <= 1_500_000
    assert len(gz_bytes) == parsed.match.replay_bytes


def test_detect_mistakes_died_holding_utility():
    round_desc = RoundDescriptor(
        round_num=1,
        start_tick=1000,
        end_tick=5000,
        t0=1000,
        nf=500,
        fe=16,
        side_a="CT",
        winner="CT",
        reason="normal",
        score_before=(0, 0),
    )
    player_sid_to_team = {"7656001": "A", "7656002": "B"}
    deaths = pd.DataFrame([{
        "tick": 2000,
        "attacker_steamid": "7656002",
        "user_steamid": "7656001",
        "weapon": "ak47",
        "user_X": 100.0,
        "user_Y": 200.0,
        "user_Z": 0.0,
    }])
    blinds = pd.DataFrame()

    def mock_parse_ticks(props, ticks):
        return pd.DataFrame([{
            "tick": 1999,
            "player_steamid": "7656001",
            "active_weapon_name": "flashbang",
            "inventory": ["weapon_flashbang", "weapon_ak47"],
        }])

    mistakes = detect_mistakes("m1", "de_mirage", [round_desc], deaths, blinds, mock_parse_ticks, player_sid_to_team)
    holding_mistakes = [m for m in mistakes if m.type == "died_holding_utility"]
    assert len(holding_mistakes) == 1
    assert holding_mistakes[0].steamid == "7656001"
    assert holding_mistakes[0].meta["weapon_held"] == "flashbang"


def test_detect_mistakes_self_flash_death():
    round_desc = RoundDescriptor(
        round_num=1,
        start_tick=1000,
        end_tick=5000,
        t0=1000,
        nf=500,
        fe=16,
        side_a="CT",
        winner="CT",
        reason="normal",
        score_before=(0, 0),
    )
    player_sid_to_team = {"7656001": "A", "7656002": "B"}
    blinds = pd.DataFrame([{
        "tick": 2000,
        "attacker_steamid": "7656001",
        "user_steamid": "7656001",
        "blind_duration": 2.5,
        "user_X": 50.0,
        "user_Y": 50.0,
        "user_Z": 0.0,
    }])
    deaths = pd.DataFrame([{
        "tick": 2060,
        "attacker_steamid": "7656002",
        "user_steamid": "7656001",
        "weapon": "m4a1",
        "user_X": 50.0,
        "user_Y": 50.0,
        "user_Z": 0.0,
    }])

    def mock_parse_ticks(props, ticks):
        return pd.DataFrame()

    mistakes = detect_mistakes("m1", "de_mirage", [round_desc], deaths, blinds, mock_parse_ticks, player_sid_to_team)
    self_flashes = [m for m in mistakes if m.type == "self_flash_death"]
    assert len(self_flashes) == 1
    assert self_flashes[0].steamid == "7656001"
    assert self_flashes[0].severity == 3


def test_compute_first_bullet_accuracy():
    player_sid_to_team = {"p1": "A", "p2": "B"}
    fires_data = []
    hurts_data = []
    for i in range(20):
        tk = 1000 + i * 50
        fires_data.append({"tick": tk, "user_steamid": "p1", "weapon": "ak47"})
        if i % 2 == 0:
            hurts_data.append({"tick": tk + 2, "attacker_steamid": "p1", "user_steamid": "p2", "weapon": "ak47"})

    fires = pd.DataFrame(fires_data)
    hurts = pd.DataFrame(hurts_data)
    results = compute_first_bullet_accuracy(fires, hurts, player_sid_to_team)
    assert "p1" in results
    pct, samples = results["p1"]
    assert samples == 20
    assert pct == 50.0
