#!/bin/bash
# Runs once, on first start of an empty data volume. Creates the non-superuser role the app uses.
set -euo pipefail
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname drm <<SQL
CREATE ROLE drm_app LOGIN PASSWORD '${APP_PASSWORD}';
GRANT CONNECT, TEMPORARY ON DATABASE drm TO drm_app;
GRANT ALL ON SCHEMA public TO drm_app;
ALTER DATABASE drm OWNER TO drm_app;
SQL
