from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    anthropic_api_key: str
    github_token: str = ""
    peec_api_key: str = ""
    peec_api_url: str = "https://api.peec.ai/customer/v1"
    peec_fixture: str = "examples/founder-mvp/peec-fixture.json"
    claude_agent_model: str = "claude-sonnet-4-6"
    ltseo_api_host: str = "127.0.0.1"
    ltseo_api_port: int = 8000

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
