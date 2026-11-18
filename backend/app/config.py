"""
Application configuration management via pydantic-settings per SPEC §1, §4 and Phase 2.
"""

import json
from pathlib import Path
from typing import Annotated, Any, Optional, List
from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "sqlite:///../data/app.db"
    data_dir: Path = Path("../data")
    tmp_dir: Path = Path("/tmp/local-scope")
    faceit_api_key: Optional[str] = None
    faceit_download_key: Optional[str] = None
    my_steamid: Optional[str] = None
    api_token: Optional[str] = None
    cors_origins: Annotated[List[str], NoDecode] = ["http://localhost:3000"]
    cors_origin_regex: Optional[str] = None
    max_dem_bytes: int = 1_500_000_000

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> List[str]:
        if isinstance(v, str):
            raw = v.strip()
            if not raw:
                return []
            if raw.startswith("["):
                parsed = json.loads(raw)
                if not isinstance(parsed, list):
                    raise ValueError("CORS_ORIGINS JSON must be an array of origin strings")
                return [str(o).strip() for o in parsed if str(o).strip()]
            return [o.strip() for o in raw.split(",") if o.strip()]
        if isinstance(v, (list, tuple, set)):
            return [str(o).strip() for o in v if str(o).strip()]
        return v

    @property
    def resolved_data_dir(self) -> Path:
        if self.data_dir.is_absolute():
            return self.data_dir
        clean_str = str(self.data_dir)
        if clean_str.startswith("../"):
            clean_str = clean_str[3:]
        return (REPO_ROOT / clean_str).resolve()

    @property
    def resolved_replays_dir(self) -> Path:
        return self.resolved_data_dir / "replays"

    @property
    def resolved_tmp_dir(self) -> Path:
        return self.tmp_dir

    @property
    def resolved_database_url(self) -> str:
        if self.database_url.startswith("sqlite:///"):
            raw_path = self.database_url.replace("sqlite:///", "")
            path_obj = Path(raw_path)
            if not path_obj.is_absolute():
                clean_str = raw_path
                if clean_str.startswith("../"):
                    clean_str = clean_str[3:]
                resolved_path = (REPO_ROOT / clean_str).resolve()
                return f"sqlite:///{resolved_path}"
        return self.database_url


settings = Settings()
