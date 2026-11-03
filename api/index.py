from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from threading import Lock
from typing import Literal
from uuid import uuid4
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator, model_validator

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_FILE = DATA_DIR / "store.json"
TARGET_SCORE_TOTAL = 100000
PLAYER_SLOTS = 4
DEFAULT_SETTINGS = {
    "returning_score": 30000,
    "uma": [50, 10, -10, -30],
}
DEFAULT_STORE = {
    "players": [],
    "games": [],
    "settings": DEFAULT_SETTINGS,
}

app = FastAPI(title="Riichi Night Ledger API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

store_lock = Lock()


class PlayerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=32)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Enter a player name.")
        return value


class SessionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    starting_points: int = Field(default=25000, ge=1000, le=100000)
    target_points: int = Field(default=30000, ge=1000, le=100000)
    starting_chips: int = Field(default=10, ge=0, le=10000)
    uma: list[float] = Field(default_factory=lambda: [30, 10, -10, -30], min_length=4, max_length=4)
    rate: float = Field(default=0.5, ge=0, le=1000, allow_inf_nan=False)
    chip_rate: float = Field(default=1, ge=0, le=1000, allow_inf_nan=False)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Enter a session name.")
        return value.strip()

    @field_validator("uma")
    @classmethod
    def check_uma(cls, value: list[float]) -> list[float]:
        import math
        if not all(math.isfinite(n) and abs(n) <= 10000 for n in value) or abs(sum(value)) > 0.000001:
            raise ValueError("Uma values must be finite and total zero.")
        return value


class GameResultCreate(BaseModel):
    player_id: str
    score: int = Field(ge=-50000, le=150000)


class SessionGameCreate(BaseModel):
    results: list[GameResultCreate] = Field(min_length=4, max_length=4)
    host_player_id: str | None = None
    winner_player_id: str | None = None

    @model_validator(mode="after")
    def unique_players(self):
        if len({entry.player_id for entry in self.results}) != 4:
            raise ValueError("Choose four different players.")
        if self.host_player_id is not None:
            if self.host_player_id not in {entry.player_id for entry in self.results}:
                raise ValueError("The host must be one of the four players.")
            top_score = max(entry.score for entry in self.results)
            winners = {entry.player_id for entry in self.results if entry.score == top_score}
            if len(winners) > 1 and self.winner_player_id is None:
                raise ValueError("Select the winner for the host fee when first place is tied.")
            if self.winner_player_id is not None and self.winner_player_id not in winners:
                raise ValueError("The host-fee winner must have the highest score.")
        return self


class ScoringSettings(BaseModel):
    returning_score: int = Field(default=30000, ge=0, le=100000)
    uma: list[float] = Field(default_factory=lambda: [50, 10, -10, -30], min_length=4, max_length=4)

    @field_validator("uma")
    @classmethod
    def validate_uma(cls, value: list[float]) -> list[float]:
        if len(value) != PLAYER_SLOTS:
            raise ValueError("Uma must have four place values.")
        return [float(item) for item in value]


class GameCreate(SessionGameCreate):
    date: str = Field(min_length=1)
    location: str = Field(default="", max_length=40)
    notes: str = Field(default="", max_length=240)
    results: list[GameResultCreate]
    scoring: ScoringSettings

    @field_validator("results")
    @classmethod
    def validate_results(cls, value: list[GameResultCreate]) -> list[GameResultCreate]:
        if len(value) != PLAYER_SLOTS:
            raise ValueError("Exactly four results are required.")

        player_ids = [entry.player_id for entry in value]
        if len(set(player_ids)) != PLAYER_SLOTS:
            raise ValueError("Players in a game must be unique.")

        total = sum(entry.score for entry in value)
        if total != TARGET_SCORE_TOTAL:
            raise ValueError("Scores must total 100000.")

        return value


class Store:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self.write(DEFAULT_STORE)

    def read(self) -> dict:
        with self.path.open("r", encoding="utf-8") as handle:
            raw = json.load(handle)
        return normalize_store(raw)

    def write(self, payload: dict) -> None:
        normalized = normalize_store(payload)
        with self.path.open("w", encoding="utf-8") as handle:
            json.dump(normalized, handle, indent=2)


@app.get("/api/health")
def healthcheck() -> dict[str, Literal["ok"]]:
    return {"status": "ok"}


@app.get("/api/auth")
def auth_status() -> dict:
    return {"can_edit": True, "mode": "local"}


@app.get("/api/bootstrap")
def bootstrap() -> dict:
    with store_lock:
        payload = store.read()

    payload["standings"] = compute_standings(payload)
    payload["summary"] = build_summary(payload)
    return payload


@app.post("/api/players")
def create_player(player: PlayerCreate) -> dict:
    with store_lock:
        payload = store.read()
        existing = next(
            (entry for entry in payload["players"] if entry["name"].lower() == player.name.lower()),
            None,
        )
        if existing:
            raise HTTPException(status_code=400, detail="Player already exists.")

        created = {"id": str(uuid4()), "name": player.name}
        payload["players"].append(created)
        store.write(payload)

    return created


@app.post("/api/sessions")
def create_session(session: SessionCreate) -> dict:
    created = {**session.model_dump(), "id": str(uuid4()), "created_at": datetime.now(timezone.utc).isoformat()}
    with store_lock:
        payload = store.read()
        payload["sessions"].insert(0, created)
        store.write(payload)
    return created


@app.post("/api/sessions/{session_id}/games")
def create_session_game(session_id: str, game: SessionGameCreate) -> dict:
    with store_lock:
        payload = store.read()
        session = next((s for s in payload["sessions"] if s["id"] == session_id), None)
        if not session:
            raise HTTPException(404, "Session not found.")
        if session.get("imported_only"):
            raise HTTPException(400, "This is an imported historical session. Create a new session to record games.")
        if any(r.player_id not in {p["id"] for p in payload["players"]} for r in game.results):
            raise HTTPException(400, "Unknown player.")
        total = session["starting_points"] * 4
        if sum(r.score for r in game.results) != total:
            raise HTTPException(400, f"Scores must total {total}.")
        uma = list(session["uma"])
        uma[0] += (session["target_points"] - session["starting_points"]) * 4 / 1000
        scoring = {"returning_score": session["target_points"], "uma": uma}
        created = {"id": str(uuid4()), "session_id": session_id, "date": datetime.now(timezone.utc).isoformat(), "location": "", "notes": "", "scoring": scoring, "results": calculate_results([r.model_dump() for r in game.results], scoring)}
        created.update(host_fee_record(game))
        payload["games"].insert(0, created)
        store.write(payload)
    return created


@app.delete("/api/players/{player_id}")
def delete_player(player_id: str) -> dict[str, bool]:
    with store_lock:
        payload = store.read()
        if any(
            result["player_id"] == player_id
            for game in payload["games"]
            for result in game["results"]
        ):
            raise HTTPException(
                status_code=400,
                detail="This player already appears in saved games.",
            )

        original_count = len(payload["players"])
        payload["players"] = [
            player for player in payload["players"] if player["id"] != player_id
        ]

        if len(payload["players"]) == original_count:
            raise HTTPException(status_code=404, detail="Player not found.")

        store.write(payload)

    return {"ok": True}


@app.put("/api/settings")
def update_settings(settings: ScoringSettings) -> dict:
    with store_lock:
        payload = store.read()
        payload["settings"] = settings.model_dump()
        store.write(payload)

    return payload["settings"]


@app.post("/api/games")
def create_game(game: GameCreate) -> dict:
    with store_lock:
        payload = store.read()
        player_ids = {player["id"] for player in payload["players"]}
        if any(result.player_id not in player_ids for result in game.results):
            raise HTTPException(status_code=400, detail="Unknown player in game.")

        saved_game = build_saved_game(game)
        payload["games"].insert(0, saved_game)
        store.write(payload)

    return saved_game


@app.delete("/api/games/{game_id}")
def delete_game(game_id: str) -> dict[str, bool]:
    with store_lock:
        payload = store.read()
        original_count = len(payload["games"])
        payload["games"] = [game for game in payload["games"] if game["id"] != game_id]

        if len(payload["games"]) == original_count:
            raise HTTPException(status_code=404, detail="Game not found.")

        store.write(payload)

    return {"ok": True}


def normalize_store(raw: dict | None) -> dict:
    payload = raw or {}
    settings = normalize_settings(payload.get("settings"))
    games = [normalize_game(game, settings) for game in payload.get("games", [])]

    return {
        "players": payload.get("players", []),
        "games": games,
        "settings": settings,
        "sessions": payload.get("sessions", []),
    }


def normalize_settings(raw: dict | None) -> dict:
    settings = {
        "returning_score": DEFAULT_SETTINGS["returning_score"],
        "uma": list(DEFAULT_SETTINGS["uma"]),
    }
    if isinstance(raw, dict):
        settings["returning_score"] = int(raw.get("returning_score", settings["returning_score"]))
        uma = raw.get("uma")
        if isinstance(uma, list) and len(uma) == PLAYER_SLOTS:
            settings["uma"] = [float(value) for value in uma]
    return settings


def normalize_game(raw_game: dict, fallback_settings: dict) -> dict:
    game = dict(raw_game)
    if game.get("result_type") == "final_points":
        # Imported points already include placement bonuses. Never recalculate
        # them with today's rules. Keep explicitly reconstructed scores.
        import math
        results = [dict(result) for result in game["results"]]
        if len(results) != 4 or len({r["player_id"] for r in results}) != 4:
            raise ValueError("Imported games require four unique players.")
        if not all(math.isfinite(r["final_points"]) for r in results):
            raise ValueError("Imported points must be finite.")
        if abs(sum(r["final_points"] for r in results)) > 0.000001:
            raise ValueError("Corrected imported points must total zero.")
        results.sort(key=lambda r: (-r["final_points"], r["player_id"]))
        for result in results:
            higher = sum(r["final_points"] > result["final_points"] for r in results)
            tied = sum(r["final_points"] == result["final_points"] for r in results)
            places = list(range(higher + 1, higher + tied + 1))
            result.update(score=result.get('score') if game.get('score_reconstructed') else None, uma=None, place=sum(places)/len(places), place_label=format_place_label(places))
        game["results"] = results
        game["scoring"] = None
        return game
    scoring = normalize_settings(game.get("scoring") or fallback_settings)
    raw_results = [
        {
            "player_id": result["player_id"],
            "score": int(result["score"]),
        }
        for result in game.get("results", [])
    ]
    game["scoring"] = scoring
    game["results"] = calculate_results(raw_results, scoring)
    return game


def build_saved_game(game: GameCreate) -> dict:
    scoring = game.scoring.model_dump()
    raw_results = [
        {
            "player_id": entry.player_id,
            "score": entry.score,
        }
        for entry in game.results
    ]
    return {
        "id": str(uuid4()),
        "date": game.date,
        "location": game.location.strip(),
        "notes": game.notes.strip(),
        "scoring": scoring,
        "results": calculate_results(raw_results, scoring),
        **host_fee_record(game),
    }


def host_fee_record(game: SessionGameCreate) -> dict:
    """Record a zero-sum chip transfer, separate from mahjong points."""
    if game.host_player_id is None:
        return {"host_player_id": None, "host_fee": None}
    winner_id = game.winner_player_id or max(game.results, key=lambda r: r.score).player_id
    return {
        "host_player_id": game.host_player_id,
        "host_fee": {
            "winner_player_id": winner_id,
            "host_player_id": game.host_player_id,
            "chips": 0 if winner_id == game.host_player_id else 5,
        },
    }


def calculate_results(raw_results: list[dict], scoring: dict) -> list[dict]:
    sorted_results = sorted(raw_results, key=lambda item: item["score"], reverse=True)
    grouped: dict[int, list[dict]] = defaultdict(list)
    for result in sorted_results:
        grouped[result["score"]].append(result)

    ranked_results: list[dict] = []
    place_cursor = 1
    for score in sorted(grouped.keys(), reverse=True):
        group = grouped[score]
        covered_places = list(range(place_cursor, place_cursor + len(group)))
        average_place = sum(covered_places) / len(covered_places)
        shared_uma = sum(scoring["uma"][place - 1] for place in covered_places) / len(covered_places)

        for entry in sorted(group, key=lambda item: item["player_id"]):
            final_points = ((entry["score"] - scoring["returning_score"]) / 1000) + shared_uma
            ranked_results.append(
                {
                    "player_id": entry["player_id"],
                    "score": entry["score"],
                    "place": average_place,
                    "place_label": format_place_label(covered_places),
                    "uma": round(shared_uma, 1),
                    "final_points": round(final_points, 1),
                }
            )

        place_cursor += len(group)

    ranked_results.sort(key=lambda item: (-item["score"], item["player_id"]))
    return ranked_results


def format_place_label(covered_places: list[int]) -> str:
    if len(covered_places) == 1:
        return ordinal(covered_places[0])
    return f"{ordinal(covered_places[0])}-{ordinal(covered_places[-1])}"


def compute_standings(payload: dict) -> list[dict]:
    standings = {
        player["id"]: {
            "id": player["id"],
            "name": player["name"],
            "games": 0,
            "points": 0.0,
            "placement_total": 0.0,
            "avg_placement": 0.0,
            "firsts": 0,
            "lasts": 0,
            "best_score": None,
            "best_points": float("-inf"),
        }
        for player in payload["players"]
    }

    for game in payload["games"]:
        for result in game["results"]:
            entry = standings.get(result["player_id"])
            if not entry:
                continue

            entry["games"] += 1
            entry["points"] += result["final_points"]
            entry["placement_total"] += result["place"]
            entry["avg_placement"] = entry["placement_total"] / entry["games"]
            entry["firsts"] += 1 if result["place"] == 1 else 0
            entry["lasts"] += 1 if result["place"] == 4 else 0
            if result["score"] is not None:
                entry["best_score"] = result["score"] if entry["best_score"] is None else max(entry["best_score"], result["score"])
            entry["best_points"] = max(entry["best_points"], result["final_points"])

    ranked = []
    for entry in standings.values():
        if entry["games"] == 0:
            continue
        ranked.append(
            {
                key: round(value, 1) if isinstance(value, float) else value
                for key, value in entry.items()
                if key != "placement_total"
            }
        )

    return sorted(
        ranked,
        key=lambda item: (-item["points"], item["avg_placement"], -item["firsts"], item["name"]),
    )


def build_summary(payload: dict) -> dict:
    standings = compute_standings(payload)
    flattened = [result for game in payload["games"] for result in game["results"]]
    top_score = max((r for r in flattened if r["score"] is not None), key=lambda item: item["score"], default=None)

    player_lookup = {player["id"]: player["name"] for player in payload["players"]}

    return {
        "games_logged": len(payload["games"]),
        "roster_size": len(payload["players"]),
        "leader": standings[0] if standings else None,
        "best_single_game": (
            {
                "player_name": player_lookup.get(top_score["player_id"], "Unknown player"),
                "score": top_score["score"],
                "points": top_score["final_points"],
            }
            if top_score
            else None
        ),
        "latest_game_date": payload["games"][0]["date"] if payload["games"] else None,
    }


def ordinal(value: int) -> str:
    lookup = {
        1: "1st",
        2: "2nd",
        3: "3rd",
        4: "4th",
    }
    return lookup.get(value, f"{value}th")


store = Store(DATA_FILE)
