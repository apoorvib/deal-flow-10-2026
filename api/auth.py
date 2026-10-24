"""Small server-side account/session layer.

PostgreSQL is used when DATABASE_URL is configured. A SQLite file under
fixtures/live is used for local development and the offline demo.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover
    psycopg = None
    dict_row = None

from fastapi import HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from api import store
from api.models import Passport, Role, UserSettings

ROOT = Path(__file__).resolve().parent.parent
SQLITE_PATH = ROOT / "fixtures" / "live" / "auth.sqlite3"
SESSION_COOKIE = "savy_session"
SESSION_TTL_SECONDS = 60 * 60 * 24 * 14
SIGNIN_TTL_SECONDS = 15 * 60
PBKDF2_ITERATIONS = 310_000


class AuthModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class AuthUser(AuthModel):
    id: str
    name: str
    email: str
    role: Role
    passport_id: str | None = None
    fund_id: str | None = None


class RegisterRequest(AuthModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=10, max_length=256)
    role: Role = "investor"


class LoginRequest(AuthModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)


class SignInLinkRequest(AuthModel):
    email: str = Field(min_length=3, max_length=254)
    role: Role = "investor"


class SignInVerifyRequest(AuthModel):
    token: str = Field(min_length=8, max_length=256)


class _SQLiteConnection:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(str(path), timeout=10)
        self.connection.row_factory = sqlite3.Row

    def execute(self, sql: str, params=()):
        return self.connection.execute(sql.replace("%s", "?"), params)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        if exc_type is None:
            self.connection.commit()
        else:
            self.connection.rollback()
        self.connection.close()


def _connect():
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if database_url:
        if psycopg is None:
            raise RuntimeError("psycopg is required when DATABASE_URL is configured.")
        return psycopg.connect(database_url, row_factory=dict_row, connect_timeout=10,
                               sslmode="require", prepare_threshold=None)
    return _SQLiteConnection(SQLITE_PATH)


def _is_postgres() -> bool:
    return bool(os.environ.get("DATABASE_URL", "").strip())


def init_db() -> None:
    with _connect() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS app_users (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
                role TEXT NOT NULL, password_hash TEXT NOT NULL, passport_id TEXT,
                fund_id TEXT, created_at BIGINT NOT NULL
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS app_sessions (
                token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
                expires_at BIGINT NOT NULL, created_at BIGINT NOT NULL
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS app_ownership (
                resource_type TEXT NOT NULL, resource_id TEXT NOT NULL,
                user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
                PRIMARY KEY(resource_type, resource_id)
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS app_signin_links (
                token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, role TEXT NOT NULL,
                expires_at BIGINT NOT NULL
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS app_session_views (
                token_hash TEXT PRIMARY KEY, view_as TEXT NOT NULL, view_user_id TEXT
            )
        """)
        db.execute("CREATE INDEX IF NOT EXISTS app_sessions_user_idx ON app_sessions(user_id)")
        db.execute("CREATE INDEX IF NOT EXISTS app_sessions_expiry_idx ON app_sessions(expires_at)")
        if _is_postgres():
            db.execute("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS passport_id TEXT")
            db.execute("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS fund_id TEXT")


def hash_password(password: str, *, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return "pbkdf2_sha256$%s$%s$%s" % (PBKDF2_ITERATIONS, salt.hex(), digest.hex())


def verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, iterations, salt_hex, digest_hex = encoded.split("$", 3)
        if scheme != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations))
        return hmac.compare_digest(actual.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def _row_get(row: Any, key: str, default=None):
    try:
        return row[key]
    except (KeyError, IndexError, TypeError):
        return default


def _user(row: Any) -> AuthUser:
    return AuthUser(id=row["id"], name=row["name"], email=row["email"], role=row["role"],
                    passport_id=_row_get(row, "passport_id"), fund_id=_row_get(row, "fund_id"))


def _session_token(db, user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    db.execute("DELETE FROM app_sessions WHERE expires_at <= %s", (now,))
    db.execute("INSERT INTO app_sessions(token_hash,user_id,expires_at,created_at) VALUES(%s,%s,%s,%s)",
               (hashlib.sha256(token.encode()).hexdigest(), user_id, now + SESSION_TTL_SECONDS, now))
    return token


def _set_cookie(response: Response, token: str) -> None:
    response.set_cookie(SESSION_COOKIE, token, httponly=True,
                        secure=os.getenv("COOKIE_SECURE", "0") == "1",
                        samesite="lax", max_age=SESSION_TTL_SECONDS, path="/")


def _valid_email(raw: str) -> str:
    email = raw.strip().lower()
    if "@" not in email or email.startswith("@") or email.endswith("@") or " " in email:
        raise HTTPException(422, "Enter a valid email address.")
    return email


def _display_name(email: str, role: str) -> str:
    if role == "issuer":
        return "Meridian Partners"
    if role == "admin":
        return "%s (admin)" % email.split("@")[0].replace(".", " ").title()
    return email.split("@")[0].replace(".", " ").replace("_", " ").title() or "Investor"


def _create_user(db, email: str, role: str, name: str | None = None,
                 password: str | None = None, fund_id: str | None = None) -> Any:
    user_id = "usr_%s" % uuid.uuid4().hex[:18]
    db.execute(
        "INSERT INTO app_users(id,name,email,role,password_hash,passport_id,fund_id,created_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)",
        (user_id, name or _display_name(email, role), email, role,
         hash_password(password or secrets.token_urlsafe(24)), None,
         fund_id if role == "issuer" else None, int(time.time())),
    )
    return db.execute("SELECT * FROM app_users WHERE id=%s", (user_id,)).fetchone()


def _find_user(db, email: str, role: str | None = None) -> Any:
    if role:
        return db.execute("SELECT * FROM app_users WHERE email=%s AND role=%s", (email, role)).fetchone()
    return db.execute("SELECT * FROM app_users WHERE email=%s", (email,)).fetchone()


def _admin_email_allowed(email: str) -> bool:
    allowed = [x.strip().lower() for x in os.getenv("ADMIN_EMAILS", "").split(",") if x.strip()]
    if allowed:
        return email in allowed
    return os.getenv("APP_ENV", "development").lower() not in {"production", "prod"}


def register(body: RegisterRequest, response: Response) -> AuthUser:
    email = _valid_email(body.email)
    if body.role == "admin" and not _admin_email_allowed(email):
        raise HTTPException(403, "This email is not authorized for admin access.")
    name = body.name.strip()
    if not name:
        raise HTTPException(422, "Name is required.")
    try:
        with _connect() as db:
            row = _create_user(db, email, body.role, name, body.password,
                               "fund_meridian" if body.role == "issuer" else None)
            token = _session_token(db, row["id"])
    except Exception as exc:
        if "unique" in str(exc).lower():
            raise HTTPException(409, "An account with this email already exists. Sign in instead.") from None
        raise
    _set_cookie(response, token)
    return _user(row)


def login(body: LoginRequest, response: Response) -> AuthUser:
    email = _valid_email(body.email)
    with _connect() as db:
        row = _find_user(db, email)
        if row is None or not verify_password(body.password, row["password_hash"]):
            raise HTTPException(401, "Email or password is incorrect.")
        token = _session_token(db, row["id"])
    _set_cookie(response, token)
    return _user(row)


def request_sign_in(body: SignInLinkRequest) -> dict:
    email = _valid_email(body.email)
    if body.role == "admin" and not _admin_email_allowed(email):
        raise HTTPException(403, "This email is not authorized for admin access.")
    token = secrets.token_urlsafe(32)
    with _connect() as db:
        db.execute("DELETE FROM app_signin_links WHERE expires_at <= %s", (int(time.time()),))
        db.execute("INSERT INTO app_signin_links(token_hash,email,role,expires_at) VALUES(%s,%s,%s,%s)",
                   (hashlib.sha256(token.encode()).hexdigest(), email, body.role,
                    int(time.time()) + SIGNIN_TTL_SECONDS))
    return {"sent": True, "devToken": token}


def complete_sign_in(body: SignInVerifyRequest, response: Response) -> AuthUser:
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    with _connect() as db:
        row = db.execute("SELECT * FROM app_signin_links WHERE token_hash=%s AND expires_at>%s",
                         (token_hash, int(time.time()))).fetchone()
        if row is None:
            raise HTTPException(401, "That sign-in link is invalid or expired.")
        db.execute("DELETE FROM app_signin_links WHERE token_hash=%s", (token_hash,))
        user = _find_user(db, row["email"], row["role"])
        if user is None:
            user = _create_user(db, row["email"], row["role"],
                                fund_id="fund_meridian" if row["role"] == "issuer" else None)
        session = _session_token(db, user["id"])
    _set_cookie(response, session)
    return _user(user)


def _session_parts(request: Request) -> tuple[str, Any, Any]:
    raw = request.cookies.get(SESSION_COOKIE)
    if not raw:
        raise HTTPException(401, "Sign in to continue.")
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    with _connect() as db:
        row = db.execute("SELECT * FROM app_sessions WHERE token_hash=%s AND expires_at>%s",
                         (token_hash, int(time.time()))).fetchone()
        view = db.execute("SELECT * FROM app_session_views WHERE token_hash=%s", (token_hash,)).fetchone()
    if row is None:
        raise HTTPException(401, "Session expired. Sign in again.")
    return token_hash, row, view


def _lookup_user(user_id: str) -> AuthUser | None:
    with _connect() as db:
        row = db.execute("SELECT * FROM app_users WHERE id=%s", (user_id,)).fetchone()
    return _user(row) if row else None


def _refresh_passport(user: AuthUser) -> AuthUser:
    if user.role != "investor":
        return user
    passports = store.all_of("passports", Passport)
    owned = [p for p in passports if owner_of("passport", p.id) == user.id]
    if owned:
        p = max(owned, key=lambda x: x.issued_at)
        user.passport_id = p.id
        with _connect() as db:
            db.execute("UPDATE app_users SET passport_id=%s WHERE id=%s", (p.id, user.id))
    return user


def refresh_user(user: AuthUser) -> AuthUser:
    return _refresh_passport(user)


DEFAULT_NOTIFICATIONS: dict[str, dict[str, bool]] = {
    "investor": {"passportExpiry": True, "fundRequests": True, "productUpdates": False},
    "issuer": {"lpCleared": True, "weeklyDigest": True, "autoNudge": True},
    "admin": {"productUpdates": False},
}


def get_settings(user: AuthUser) -> UserSettings:
    saved = store.get_raw("settings", user.id) or {}
    return UserSettings(
        name=user.name,
        email=user.email,
        notifications={**DEFAULT_NOTIFICATIONS[user.role], **saved.get("notifications", {})},
        auto_share_on_invite=bool(saved.get("autoShareOnInvite", True)),
    )


def update_settings(user: AuthUser, patch: dict[str, Any]) -> UserSettings:
    name = patch.get("name")
    if isinstance(name, str) and name.strip():
        with _connect() as db:
            db.execute("UPDATE app_users SET name=%s WHERE id=%s", (name.strip(), user.id))
        user.name = name.strip()
    current = get_settings(user)
    notifications = patch.get("notifications")
    if not isinstance(notifications, dict):
        notifications = current.notifications
    saved = {
        "notifications": {**current.notifications, **{str(k): bool(v) for k, v in notifications.items()}},
        "autoShareOnInvite": bool(patch.get("autoShareOnInvite", current.auto_share_on_invite)),
    }
    store.put_raw("settings", user.id, saved)
    return get_settings(user)


def change_password(request: Request, current: str, next_password: str) -> None:
    user = current_user(request)
    if not current or not next_password:
        raise HTTPException(400, "Enter both passwords.")
    if len(next_password) < 10:
        raise HTTPException(400, "Use at least 10 characters for the new password.")
    with _connect() as db:
        row = db.execute("SELECT password_hash FROM app_users WHERE id=%s", (user.id,)).fetchone()
        if row is None or not verify_password(current, row["password_hash"]):
            raise HTTPException(400, "Current password is incorrect.")
        db.execute("UPDATE app_users SET password_hash=%s WHERE id=%s", (hash_password(next_password), user.id))


def user_exists(email: str, role: str = "investor") -> bool:
    with _connect() as db:
        return _find_user(db, email, role) is not None


def ensure_account_session(email: str, role: str, response: Response,
                           name: str | None = None, fund_id: str | None = None) -> AuthUser:
    email = _valid_email(email)
    with _connect() as db:
        row = _find_user(db, email, role)
        if row is None:
            row = _create_user(db, email, role, name, fund_id=fund_id)
        token = _session_token(db, row["id"])
    _set_cookie(response, token)
    return _refresh_passport(_user(row))


def current_user(request: Request) -> AuthUser:
    _, session, view = _session_parts(request)
    user_id = _row_get(view, "view_user_id") if view else None
    user = _lookup_user(user_id) if user_id else _lookup_user(session["user_id"])
    if user is None:
        raise HTTPException(401, "Session user no longer exists.")
    return _refresh_passport(user)


def admin_user(request: Request) -> AuthUser:
    _, session, _ = _session_parts(request)
    user = _lookup_user(session["user_id"])
    if user is None or user.role != "admin":
        raise HTTPException(403, "Admin access required.")
    return user


def logout(request: Request, response: Response) -> None:
    raw = request.cookies.get(SESSION_COOKIE)
    if raw:
        token_hash = hashlib.sha256(raw.encode()).hexdigest()
        with _connect() as db:
            db.execute("DELETE FROM app_sessions WHERE token_hash=%s", (token_hash,))
            db.execute("DELETE FROM app_session_views WHERE token_hash=%s", (token_hash,))
    response.delete_cookie(SESSION_COOKIE, path="/", httponly=True,
                           secure=os.getenv("COOKIE_SECURE", "0") == "1", samesite="lax")


def own(resource_type: str, resource_id: str, user_id: str) -> None:
    if not resource_id:
        return
    with _connect() as db:
        row = db.execute("SELECT user_id FROM app_ownership WHERE resource_type=%s AND resource_id=%s",
                         (resource_type, resource_id)).fetchone()
        if row and row["user_id"] != user_id:
            raise HTTPException(404, "Resource not found")
        if not row:
            db.execute("INSERT INTO app_ownership(resource_type,resource_id,user_id) VALUES(%s,%s,%s)",
                       (resource_type, resource_id, user_id))


def owner_of(resource_type: str, resource_id: str) -> str | None:
    with _connect() as db:
        row = db.execute("SELECT user_id FROM app_ownership WHERE resource_type=%s AND resource_id=%s",
                         (resource_type, resource_id)).fetchone()
    return row["user_id"] if row else None


def require_owner(resource_type: str, resource_id: str, user: AuthUser) -> None:
    if owner_of(resource_type, resource_id) != user.id:
        raise HTTPException(404, "Resource not found")


def delete_owner(resource_type: str, resource_id: str) -> None:
    with _connect() as db:
        db.execute("DELETE FROM app_ownership WHERE resource_type=%s AND resource_id=%s",
                   (resource_type, resource_id))


def ensure_demo_user(email: str, role: str, name: str, fund_id: str | None = None) -> AuthUser:
    with _connect() as db:
        row = _find_user(db, email, role)
        if row is None:
            row = _create_user(db, email, role, name, fund_id=fund_id)
    return _user(row)


def switch_view(request: Request, as_view: str) -> AuthUser | None:
    if as_view not in {"admin", "investor", "issuer", "visitor"}:
        raise HTTPException(422, "Invalid admin view.")
    admin = admin_user(request)
    token_hash, _, _ = _session_parts(request)
    if as_view == "visitor":
        with _connect() as db:
            db.execute("DELETE FROM app_session_views WHERE token_hash=%s", (token_hash,))
        return None
    if as_view == "admin":
        view_user_id = admin.id
    else:
        email = "jane@probe.invalid" if as_view == "investor" else "gp@meridian.probe.invalid"
        name = "Jane Investor" if as_view == "investor" else "Meridian Partners"
        view_user_id = ensure_demo_user(email, as_view, name,
                                        "fund_meridian" if as_view == "issuer" else None).id
    with _connect() as db:
        db.execute("DELETE FROM app_session_views WHERE token_hash=%s", (token_hash,))
        db.execute("INSERT INTO app_session_views(token_hash,view_as,view_user_id) VALUES(%s,%s,%s)",
                   (token_hash, as_view, view_user_id))
    return _lookup_user(view_user_id)


def current_admin_view(request: Request) -> str:
    _, _, view = _session_parts(request)
    return _row_get(view, "view_as", "admin") if view else "admin"
