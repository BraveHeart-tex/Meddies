-- Device registrations (#353): one row per Firebase installation, owned by one account.
-- Saving an installation registered to another account moves the row to the caller.
-- The token is a credential: it is read only by the reminder sender (#30).
CREATE TABLE device_registrations (
 installation_id TEXT PRIMARY KEY NOT NULL,
 owner_id TEXT NOT NULL,
 token TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX device_registrations_owner ON device_registrations(owner_id);
