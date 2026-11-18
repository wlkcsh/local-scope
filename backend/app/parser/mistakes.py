"""
Mistake Detection Engine per SPEC §3.4 and Scope.gg Parity.
Flags unspent utility on death, harmful team flashes, untraded early deaths,
deaths while holding utility/knife, and self-flash deaths.
"""

from typing import List, Dict, Tuple, Optional, Any, Set
import pandas as pd
from app.schemas import MistakeRow
from app.parser.constants import get_grenade_cost, HOLDING_WEAPONS, normalize_weapon_name
from app.parser.rounds import RoundDescriptor
from app.parser.maps import project


def detect_mistakes(
    match_id: str,
    map_name: str,
    rounds: List[RoundDescriptor],
    deaths: pd.DataFrame,
    blinds: pd.DataFrame,
    parser_ticks_fn,
    player_sid_to_team: Dict[str, str],  # sid -> 'A' or 'B'
) -> List[MistakeRow]:
    mistakes: List[MistakeRow] = []

    if deaths.empty:
        return mistakes

    # Map each death to its round
    death_ticks = [int(t) for t in deaths["tick"].dropna().unique()]
    death_ticks_minus_1 = [max(0, t - 1) for t in death_ticks]

    # 1. Unspent Utility & Active Weapon (§3.4)
    # Bulk fetch inventory and active weapon at death_tick - 1
    inventory_df = pd.DataFrame()
    if death_ticks_minus_1:
        try:
            inventory_df = parser_ticks_fn(["inventory", "player_steamid", "active_weapon_name"], ticks=death_ticks_minus_1)
        except Exception:
            try:
                inventory_df = parser_ticks_fn(["inventory", "player_steamid"], ticks=death_ticks_minus_1)
            except Exception:
                pass

    # Build maps: (tick, steamid) -> inventory list, active weapon
    inv_map: Dict[Tuple[int, str], List[str]] = {}
    active_wpn_map: Dict[Tuple[int, str], str] = {}
    if not inventory_df.empty and "player_steamid" in inventory_df.columns:
        for row in inventory_df.itertuples():
            tk = int(row.tick)
            sid = str(row.player_steamid)
            inv = getattr(row, "inventory", []) or []
            if isinstance(inv, list):
                inv_map[(tk, sid)] = [str(x) for x in inv]
            act = getattr(row, "active_weapon_name", "") or ""
            if act:
                active_wpn_map[(tk, sid)] = normalize_weapon_name(str(act))

    for _, d_row in deaths.iterrows():
        d_tick = int(d_row["tick"])
        vic_sid = str(d_row.get("user_steamid", ""))
        vx = float(d_row.get("user_X", 0.0) or 0.0)
        vy = float(d_row.get("user_Y", 0.0) or 0.0)
        vz = float(d_row.get("user_Z", 0.0) or 0.0)
        _, _, lyr = project(map_name, vx, vy, vz)

        # Find matching round
        matched_round = None
        for r in rounds:
            if r.start_tick <= d_tick <= r.end_tick:
                matched_round = r
                break
        if not matched_round:
            continue

        r_num = matched_round.round_num

        # Check inventory at death_tick - 1
        inv_items = inv_map.get((d_tick - 1, vic_sid), [])
        if inv_items:
            util_items = []
            util_val = 0
            for item in inv_items:
                cost = get_grenade_cost(item)
                if cost > 0:
                    util_items.append(item)
                    util_val += cost

            if util_val > 500:
                severity = 1 if util_val < 700 else (2 if util_val < 1000 else 3)
                mistakes.append(MistakeRow(
                    match_id=match_id,
                    steamid=vic_sid,
                    round=r_num,
                    type="unspent_utility",
                    tick=d_tick,
                    x=vx,
                    y=vy,
                    z=vz,
                    layer=lyr,
                    severity=severity,
                    meta={"value": util_val, "items": util_items},
                ))

        # 2. Untraded Early Death (§3.4)
        # Less than 960 ticks (15s) after freeze_end, and no teammate kills killer within 320 ticks (5s)
        ticks_into_round = d_tick - matched_round.start_tick
        if 0 <= ticks_into_round < 960:
            atk_sid = str(d_row.get("attacker_steamid", ""))
            vic_team = player_sid_to_team.get(vic_sid)

            # Check trade kill on attacker within 320 ticks by a teammate of victim
            trade_kills = deaths[
                (deaths["user_steamid"] == atk_sid) &
                (deaths["tick"].between(d_tick, d_tick + 320))
            ]
            is_traded = False
            for _, tr in trade_kills.iterrows():
                tr_atk = str(tr.get("attacker_steamid", ""))
                if player_sid_to_team.get(tr_atk) == vic_team:
                    is_traded = True
                    break

            if not is_traded:
                # Check if first death in round
                r_deaths = deaths[(deaths["tick"] >= matched_round.start_tick) & (deaths["tick"] <= matched_round.end_tick)].sort_values(by="tick")
                is_first = not r_deaths.empty and int(r_deaths.iloc[0]["tick"]) == d_tick
                severity = 3 if is_first else 2

                mistakes.append(MistakeRow(
                    match_id=match_id,
                    steamid=vic_sid,
                    round=r_num,
                    type="untraded_early_death",
                    tick=d_tick,
                    x=vx,
                    y=vy,
                    z=vz,
                    layer=lyr,
                    severity=severity,
                    meta={
                        "secs_into_round": round(ticks_into_round / 64.0, 1),
                        "killer": atk_sid,
                        "first_death": is_first,
                    },
                ))

        # 3. Died Holding Utility / Knife (Scope.gg Parity)
        atk_sid = str(d_row.get("attacker_steamid", ""))
        active_wpn = active_wpn_map.get((d_tick - 1, vic_sid), "")
        if not active_wpn:
            active_wpn = normalize_weapon_name(str(d_row.get("user_weapon", "") or d_row.get("victim_weapon", "")))
        else:
            active_wpn = normalize_weapon_name(active_wpn)

        killer_wpn = normalize_weapon_name(str(d_row.get("weapon", "")))
        if active_wpn and (active_wpn in HOLDING_WEAPONS or "grenade" in active_wpn or "flash" in active_wpn or "molotov" in active_wpn or "knife" in active_wpn):
            is_knife_fight = ("knife" in active_wpn and "knife" in killer_wpn)
            if not is_knife_fight and atk_sid and atk_sid != vic_sid:
                r_deaths = deaths[(deaths["tick"] >= matched_round.start_tick) & (deaths["tick"] <= matched_round.end_tick)].sort_values(by="tick")
                is_first_death = not r_deaths.empty and int(r_deaths.iloc[0]["tick"]) == d_tick
                ticks_into_round = d_tick - matched_round.start_tick
                sev = 3 if (is_first_death or 0 <= ticks_into_round < 960) else 2
                mistakes.append(MistakeRow(
                    match_id=match_id,
                    steamid=vic_sid,
                    round=r_num,
                    type="died_holding_utility",
                    tick=d_tick,
                    x=vx,
                    y=vy,
                    z=vz,
                    layer=lyr,
                    severity=sev,
                    meta={
                        "weapon_held": active_wpn,
                        "killer": atk_sid,
                        "killer_weapon": killer_wpn,
                        "first_death": is_first_death,
                    },
                ))

    # 4. Team Flash & Self-Flash Death (§3.4 & Scope.gg Parity)
    if not blinds.empty:
        for _, b_row in blinds.iterrows():
            b_tick = int(b_row["tick"])
            atk_sid = str(b_row.get("attacker_steamid", ""))
            vic_sid = str(b_row.get("user_steamid", ""))
            dur = float(b_row.get("blind_duration", 0.0) or 0.0)

            if not atk_sid or not vic_sid or dur < 1.0:
                continue

            # Find matching round
            matched_round = None
            for r in rounds:
                if r.start_tick <= b_tick <= r.end_tick:
                    matched_round = r
                    break
            if not matched_round:
                continue

            vx = float(b_row.get("user_X", 0.0) or 0.0)
            vy = float(b_row.get("user_Y", 0.0) or 0.0)
            vz = float(b_row.get("user_Z", 0.0) or 0.0)
            _, _, lyr = project(map_name, vx, vy, vz)

            # Case A: Self-Flash Death (Victim blinded themselves and died while blind)
            if atk_sid == vic_sid:
                blind_end_tick = b_tick + int(dur * 64)
                vic_deaths = deaths[
                    (deaths["user_steamid"] == vic_sid) &
                    (deaths["tick"].between(b_tick, blind_end_tick))
                ]
                for _, vd in vic_deaths.iterrows():
                    d_killer = str(vd.get("attacker_steamid", ""))
                    vd_tick = int(vd["tick"])
                    if d_killer and d_killer != vic_sid:
                        severity = 3 if dur >= 2.0 else 2
                        mistakes.append(MistakeRow(
                            match_id=match_id,
                            steamid=vic_sid,
                            round=matched_round.round_num,
                            type="self_flash_death",
                            tick=vd_tick,
                            x=vx,
                            y=vy,
                            z=vz,
                            layer=lyr,
                            severity=severity,
                            meta={
                                "blind_duration": round(dur, 2),
                                "killer": d_killer,
                                "ticks_blind": vd_tick - b_tick,
                            },
                        ))
                continue

            # Case B: Team Flash (Harmful flash on teammate)
            if dur <= 1.5:
                continue

            atk_team = player_sid_to_team.get(atk_sid)
            vic_team = player_sid_to_team.get(vic_sid)
            if not atk_team or not vic_team or atk_team != vic_team:
                continue  # Enemy flash

            # Check if victim dies within blind window (dur * 64 ticks)
            blind_end_tick = b_tick + int(dur * 64)
            vic_died = deaths[
                (deaths["user_steamid"] == vic_sid) &
                (deaths["tick"].between(b_tick, blind_end_tick))
            ]
            severity = 3 if not vic_died.empty else 1

            mistakes.append(MistakeRow(
                match_id=match_id,
                steamid=atk_sid,
                round=matched_round.round_num,
                type="team_flash",
                tick=b_tick,
                x=vx,
                y=vy,
                z=vz,
                layer=lyr,
                severity=severity,
                meta={"victim": vic_sid, "duration": round(dur, 2)},
            ))

    return mistakes
