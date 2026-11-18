"""
Application configuration management via pydantic-settings per SPEC §1, §4 and Phase 2.
"""

from pathlib import Path
from typing import Optional, List
from pydantic_settings import BaseSettings, SettingsConfigDict

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
    cors_origins: List[str] = ["http://localhost:3000"]
    max_dem_bytes: int = 1_500_000_000

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
