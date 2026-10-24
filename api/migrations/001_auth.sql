CREATE TABLE IF NOT EXISTS app_users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('investor', 'issuer', 'admin')),
    password_hash TEXT NOT NULL,
    passport_id TEXT,
    fund_id TEXT,
    created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    expires_at BIGINT NOT NULL,
    created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS app_sessions_user_idx ON app_sessions(user_id);
CREATE INDEX IF NOT EXISTS app_sessions_expiry_idx ON app_sessions(expires_at);

CREATE TABLE IF NOT EXISTS app_signin_links (
    token_hash TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    expires_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_session_views (
    token_hash TEXT PRIMARY KEY,
    view_as TEXT NOT NULL,
    view_user_id TEXT
);

CREATE TABLE IF NOT EXISTS app_ownership (
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    PRIMARY KEY(resource_type, resource_id)
);
