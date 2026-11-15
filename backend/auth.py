import os
from uuid import UUID

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from models import User


load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")

if not SUPABASE_URL:
    raise RuntimeError("SUPABASE_URL is not configured")


SUPABASE_ISSUER = f"{SUPABASE_URL}/auth/v1"

SUPABASE_JWKS_URL = (
    f"{SUPABASE_ISSUER}/.well-known/jwks.json"
)


security = HTTPBearer(
    auto_error=False
)


jwks_client = PyJWKClient(
    SUPABASE_JWKS_URL
)


def verify_supabase_token(token: str) -> dict:
    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token)

        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=[
                "RS256",
                "ES256",
            ],
            audience="authenticated",
            issuer=SUPABASE_ISSUER,
        )

        return payload

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired",
        )

    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )
    except Exception as exc:
        print(
            f"SUPABASE JWT VERIFICATION ERROR: "
            f"{type(exc).__name__}: {exc}"
        )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unable to verify authentication token",
        )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        security
    ),
    db: AsyncSession = Depends(get_db),
) -> User:

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    if credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer authentication required",
        )

    payload = verify_supabase_token(
        credentials.credentials
    )

    subject = payload.get("sub")
    email = payload.get("email")

    if not subject:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token does not contain a user ID",
        )

    try:
        user_id = UUID(subject)

    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Supabase user ID",
        )

    # Check for existing user by either UUID ID or Email address
    conditions = [User.id == user_id]
    if email:
        conditions.append(User.email == email)

    result = await db.execute(
        select(User).where(or_(*conditions))
    )

    user = result.scalars().first()

    user_metadata = payload.get("user_metadata", {})
    display_name = user_metadata.get("display_name") or user_metadata.get("full_name")

    if user is None:
        user = User(
            id=user_id,
            email=email or "",
            display_name=display_name,
        )
        db.add(user)
    else:
        # Update existing user profile with latest metadata if needed
        if email and user.email != email:
            user.email = email
        if display_name and not user.display_name:
            user.display_name = display_name

    await db.commit()
    await db.refresh(user)

    return user