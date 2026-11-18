"""
Unit tests for delta encoding, yaw wrapping, and replay serialization per SPEC §2.2, §3.8, §6.
"""

import gzip
import pytest
import orjson
from app.parser.frames import (
    delta_encode,
    delta_decode,
    encode_yaw_deltas,
    decode_yaw_deltas,
    build_change_list,
)
from app.parser.parser import serialize_replay_gzip
from app.schemas import ReplayFile, QuantizationConfig, ReplayPlayer, ReplayRound


def test_delta_round_trip():
    """Verify that delta encoding and decoding perfectly reconstruct integer sequences."""
    original = [1000, 1002, 1005, 998, 1020, 850, -200, 0, 500]
    encoded = delta_encode(original)
    assert encoded[0] == original[0]
    assert encoded[1] == 2
    assert encoded[2] == 3
    assert encoded[3] == -7

    decoded = delta_decode(encoded)
    assert decoded == original


def test_yaw_wrap_shortest_arc():
    """
    Verify that yaw angles crossing the 360/0 degree boundary (120-step space)
    take the shortest angular arc wrapped within [-60, 59] per SPEC §3.8.
    """
    # 357 deg (index 119) -> 3 deg (index 1): should be +2 steps (+6 deg), not -118
    yaws_forward = [119, 1]
    deltas_fwd = encode_yaw_deltas(yaws_forward)
    assert deltas_fwd == [119, 2]
    decoded_fwd = decode_yaw_deltas(deltas_fwd)
    assert decoded_fwd == [119, 1]

    # 3 deg (index 1) -> 357 deg (index 119): should be -2 steps (-6 deg), not +118
    yaws_backward = [1, 119]
    deltas_bwd = encode_yaw_deltas(yaws_backward)
    assert deltas_bwd == [1, -2]
    decoded_bwd = decode_yaw_deltas(deltas_bwd)
    assert decoded_bwd == [1, 119]

    # Half turn (60 steps = 180 deg)
    yaws_half = [0, 60]
    deltas_half = encode_yaw_deltas(yaws_half)
    assert -60 <= deltas_half[1] <= 59


def test_build_change_list():
    """Verify sparse [frame, value] representation."""
    series = [100, 100, 100, 85, 85, 0, 0]
    changes = build_change_list(series)
    assert changes == [(0, 100), (3, 85), (5, 0)]


def test_replay_size_budget_and_serialization():
    """Verify ReplayFile serializes with orjson and gzip under budget."""
    replay = ReplayFile(
        v=1,
        match_id="test-match",
        map="de_mirage",
        tick_rate=64,
        frame_step=8,
        q=QuantizationConfig(pos=2, yaw=3),
        weapons=["knife", "ak47"],
        players=[ReplayPlayer(sid="76561198000000001", name="Player1", team="A")],
        rounds=[
            ReplayRound(
                n=1,
                t0=1000,
                nf=50,
                fe=16,
                side_a="CT",
                winner="CT",
                reason="normal",
                score=(0, 0),
                p=[],
            )
        ],
    )
    gz_bytes = serialize_replay_gzip(replay)
    assert len(gz_bytes) < 1_500_000
    decompressed = gzip.decompress(gz_bytes)
    data = orjson.loads(decompressed)
    assert data["match_id"] == "test-match"
    assert data["map"] == "de_mirage"
