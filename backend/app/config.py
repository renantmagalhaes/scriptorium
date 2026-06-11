from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    redis_url: str
    corpus_root: str = "/corpus"
    preserve_catalog: bool = True
    ui_username: str
    ui_password: str
    secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 8  # 8-hour sessions

    model_config = {"env_file": ".env"}


settings = Settings()
