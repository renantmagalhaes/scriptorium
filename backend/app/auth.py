from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt

from .config import settings
from .schemas import TokenResponse

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def _verify_credentials(username: str, password: str) -> bool:
    return username == settings.ui_username and password == settings.ui_password


def _create_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode(
        {"sub": subject, "exp": expire},
        settings.secret_key,
        algorithm=settings.jwt_algorithm,
    )


def _decode_token(token: str) -> str:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
        sub: str | None = payload.get("sub")
        if sub is None:
            raise exc
        return sub
    except JWTError:
        raise exc


async def get_current_user(token: Annotated[str, Depends(oauth2_scheme)]) -> str:
    return _decode_token(token)


async def get_current_user_query(token: str = Query(..., alias="token")) -> str:
    """Auth dependency that reads the JWT from a ?token= query param.
    Used by the inline file-view endpoint so <iframe>/<img> src URLs work
    without custom headers."""
    return _decode_token(token)


async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
) -> TokenResponse:
    if not _verify_credentials(form_data.username, form_data.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return TokenResponse(access_token=_create_token(form_data.username))
