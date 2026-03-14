from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    gemini_api_key: str = ""
    github_token: str = ""
    github_repo: str = ""  # "username/repo-name"
    target_site_url: str = "https://hothaifa96.github.io/DevSecOps22/"
    scrape_interval_minutes: int = 60
    database_url: str = "sqlite:///./devops_solver.db"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]


settings = Settings()
