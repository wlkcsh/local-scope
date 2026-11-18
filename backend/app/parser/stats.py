"""
Player Match Statistics Computation per SPEC §3.6 and §2.1.
Calculates K/D/A, ADR, KAST %, trade kills/deaths, clutches, utility damage,
and integrates aim/movement mechanics.
"""

from typing import Dict, List, Tuple, Optional, Any, Set
import pandas as pd
from app.schemas import PlayerMatchStatsRow
from app.parser.rounds import RoundDescriptor, TeamRoster
from app.parser.constants import normalize_weapon_name


def compute_player_stats(
    match_id: str,
    rounds: List[RoundDescriptor],
    roster: TeamRoster,
    deaths: pd.DataFrame,
    hurts: pd.DataFrame,
    blinds: pd.DataFrame,
    fires: pd.DataFrame,
    highlights: List[Any],
    counter_strafe_results: Dict[str, Tuple[Optional[float], int]],
    ttd_results: Dict[str, Tuple[Optional[float], int]],
    first_bullet_acc_results: Optional[Dict[str, Tuple[Optional[float], int]]] = None,
) -> List[PlayerMatchStatsRow]:
    all_players: Dict[str, Dict[str, Any]] = {}

    # Initialize all players from team A and team B rosters
    for sid, name in roster.team_a_pids.items():
        all_players[sid] = {
            "name": name,
            "team": "A",
            "kills": 0, "deaths": 0, "assists": 0,
            "damage_dealt": 0,
            "hs_kills": 0,
            "kast_rounds": set(),
            "survived_rounds": set(),
            "traded_rounds": set(),
            "first_kills": 0, "first_deaths": 0,
            "trade_kills": 0, "traded_deaths": 0,
            "k3": 0, "k4": 0, "k5": 0,
            "clutches_played": 0, "clutches_won": 0,
            "utility_damage": 0,
            "enemies_flashed": 0, "flash_assists": 0, "team_flashes": 0,
            "shots_fired": 0,
        }

    for sid, name in roster.team_b_pids.items():
        all_players[sid] = {
            "name": name,
            "team": "B",
            "kills": 0, "deaths": 0, "assists": 0,
            "damage_dealt": 0,
            "hs_kills": 0,
            "kast_rounds": set(),
            "survived_rounds": set(),
            "traded_rounds": set(),
            "first_kills": 0, "first_deaths": 0,
            "trade_kills": 0, "traded_deaths": 0,
            "k3": 0, "k4": 0, "k5": 0,
            "clutches_played": 0, "clutches_won": 0,
            "utility_damage": 0,
            "enemies_flashed": 0, "flash_assists": 0, "team_flashes": 0,
            "shots_fired": 0,
        }

    total_rounds = len(rounds) or 1

    # 1. Shots Fired
    if not fires.empty:
        counts = fires["user_steamid"].value_counts()
        for sid, cnt in counts.items():
            sid_str = str(sid)
            if sid_str in all_players:
                all_players[sid_str]["shots_fired"] = int(cnt)

    # 2. Damage & ADR calculation: min(dmg_health, victim hp before hit), enemies only
    if not hurts.empty:
        for r in rounds:
            st = r.start_tick
            et = r.end_tick
            r_hurts = hurts[(hurts["tick"] >= st) & (hurts["tick"] <= et)]
            
            # Track victim HP
            victim_hp: Dict[str, int] = {}
            
            for _, hrow in r_hurts.iterrows():
                atk = str(hrow.get("attacker_steamid", ""))
                vic = str(hrow.get("user_steamid", ""))
                dmg = int(hrow.get("dmg_health", 0) or 0)
                wpn = normalize_weapon_name(str(hrow.get("weapon", "")))

                if not atk or not vic or atk == vic or atk not in all_players or vic not in all_players:
                    continue

                if all_players[atk]["team"] == all_players[vic]["team"]:
                    continue  # Friendly fire

                v_curr_hp = victim_hp.get(vic, 100)
                actual_dmg = max(0, min(dmg, v_curr_hp))
                victim_hp[vic] = v_curr_hp - actual_dmg

                all_players[atk]["damage_dealt"] += actual_dmg

                if wpn in ("hegrenade", "molotov", "incgrenade", "inferno"):
                    all_players[atk]["utility_damage"] += dmg

    # 3. Kills, Deaths, Assists, Headshots, Trades & First Kills
    if not deaths.empty:
        for r in rounds:
            st = r.start_tick
            et = r.end_tick
            r_num = r.round_num
            r_deaths = deaths[(deaths["tick"] >= st) & (deaths["tick"] <= et)].sort_values(by="tick")

            # Entry kill / death
            if not r_deaths.empty:
                first_k = r_deaths.iloc[0]
                f_atk = str(first_k.get("attacker_steamid", ""))
                f_vic = str(first_k.get("user_steamid", ""))
                if f_atk in all_players:
                    all_players[f_atk]["first_kills"] += 1
                if f_vic in all_players:
                    all_players[f_vic]["first_deaths"] += 1

            # Round kills count for k3, k4, k5
            round_atk_kills: Dict[str, int] = {}

            for _, drow in r_deaths.iterrows():
                atk = str(drow.get("attacker_steamid", ""))
                vic = str(drow.get("user_steamid", ""))
                ass = str(drow.get("assister_steamid", ""))
                d_tick = int(drow["tick"])
                is_hs = bool(drow.get("headshot", False))
                is_flash_assist = bool(drow.get("assistedflash", False))

                if atk in all_players and atk != vic:
                    all_players[atk]["kills"] += 1
                    all_players[atk]["kast_rounds"].add(r_num)
                    if is_hs:
                        all_players[atk]["hs_kills"] += 1
                    round_atk_kills[atk] = round_atk_kills.get(atk, 0) + 1

                    # Check Trade Kill: was atk killing someone who killed atk's teammate within 320 ticks?
                    atk_team = all_players[atk]["team"]
                    prev_deaths = r_deaths[(r_deaths["tick"] >= d_tick - 320) & (r_deaths["tick"] < d_tick)]
                    for _, pd_row in prev_deaths.iterrows():
                        p_atk = str(pd_row.get("attacker_steamid", ""))
                        p_vic = str(pd_row.get("user_steamid", ""))
                        # If the killer in this event (atk) is avenging a teammate (p_vic) killed by p_atk (which is vic)
                        if p_atk == vic and p_vic in all_players and all_players[p_vic]["team"] == atk_team:
                            all_players[atk]["trade_kills"] += 1
                            all_players[p_vic]["traded_deaths"] += 1
                            all_players[p_vic]["traded_rounds"].add(r_num)
                            break

                if vic in all_players:
                    all_players[vic]["deaths"] += 1

                if ass in all_players and ass not in ("0", "None"):
                    all_players[ass]["assists"] += 1
                    all_players[ass]["kast_rounds"].add(r_num)
                    if is_flash_assist:
                        all_players[ass]["flash_assists"] += 1

            for atk, kcount in round_atk_kills.items():
                if kcount == 3:
                    all_players[atk]["k3"] += 1
                elif kcount == 4:
                    all_players[atk]["k4"] += 1
                elif kcount >= 5:
                    all_players[atk]["k5"] += 1

            # Survival calculation: who didn't die this round?
            round_dead = set(r_deaths["user_steamid"].astype(str))
            for sid in all_players:
                if sid not in round_dead:
                    all_players[sid]["survived_rounds"].add(r_num)
                    all_players[sid]["kast_rounds"].add(r_num)

    # 4. Flashes
    if not blinds.empty:
        for _, brow in blinds.iterrows():
            atk = str(brow.get("attacker_steamid", ""))
            vic = str(brow.get("user_steamid", ""))
            dur = float(brow.get("blind_duration", 0.0) or 0.0)
            if not atk or not vic or atk not in all_players or vic not in all_players or dur <= 0.2:
                continue

            if all_players[atk]["team"] == all_players[vic]["team"]:
                all_players[atk]["team_flashes"] += 1
            else:
                all_players[atk]["enemies_flashed"] += 1

    # 5. Clutches from highlights
    for hl in highlights:
        if hl.type == "clutch":
            sid = hl.steamid
            if sid in all_players:
                all_players[sid]["clutches_played"] += 1
                all_players[sid]["clutches_won"] += 1

    # 6. Assemble Output Rows
    rows: List[PlayerMatchStatsRow] = []
    for sid, pdata in all_players.items():
        k = pdata["kills"]
        d = pdata["deaths"]
        a = pdata["assists"]
        dmg = pdata["damage_dealt"]
        adr = round(dmg / total_rounds, 1)
        hs_pct = round((pdata["hs_kills"] / max(1, k)) * 100.0, 1)

        # KAST: union of Kill, Assist, Survived, Traded rounds
        kast_union = pdata["kast_rounds"].union(pdata["traded_rounds"])
        kast_pct = round((len(kast_union) / total_rounds) * 100.0, 1)

        cs_val, cs_samples = counter_strafe_results.get(sid, (None, 0))
        ttd_val, ttd_samples = ttd_results.get(sid, (None, 0))
        fba_val, fba_samples = (first_bullet_acc_results or {}).get(sid, (None, 0))

        rows.append(PlayerMatchStatsRow(
            match_id=match_id,
            steamid=sid,
            name=pdata["name"],
            team=pdata["team"],
            kills=k,
            deaths=d,
            assists=a,
            adr=adr,
            hs_pct=hs_pct,
            kast_pct=kast_pct,
            first_kills=pdata["first_kills"],
            first_deaths=pdata["first_deaths"],
            trade_kills=pdata["trade_kills"],
            traded_deaths=pdata["traded_deaths"],
            k3=pdata["k3"],
            k4=pdata["k4"],
            k5=pdata["k5"],
            clutches_played=pdata["clutches_played"],
            clutches_won=pdata["clutches_won"],
            utility_damage=pdata["utility_damage"],
            enemies_flashed=pdata["enemies_flashed"],
            flash_assists=pdata["flash_assists"],
            team_flashes=pdata["team_flashes"],
            shots_fired=pdata["shots_fired"],
            ttd_ms_median=ttd_val,
            ttd_samples=ttd_samples,
            counter_strafe_pct=cs_val,
            counter_strafe_samples=cs_samples,
            first_bullet_acc_pct=fba_val,
            first_bullet_acc_samples=fba_samples,
        ))

    return rows
