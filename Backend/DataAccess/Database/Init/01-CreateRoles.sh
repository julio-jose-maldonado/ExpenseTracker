#!/bin/sh
# Lo corre la imagen de Postgres una sola vez, cuando el volumen está vacío.
# Roles separados:
#   expense_migrator: dueño de la base (y de `public`); aplica las migraciones (DDL).
#   expense_app:      lo usa DataAccess en runtime; solo DML sobre lo que cree el migrator.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v db="$POSTGRES_DB" \
  -v migrator_password="$MIGRATOR_PASSWORD" \
  -v app_password="$APP_PASSWORD" <<'SQL'
CREATE ROLE expense_migrator LOGIN PASSWORD :'migrator_password';
CREATE ROLE expense_app LOGIN PASSWORD :'app_password';

-- En Postgres 15+ `public` pertenece a pg_database_owner: el dueño de la base puede crear ahí.
ALTER DATABASE :"db" OWNER TO expense_migrator;
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO expense_app;
GRANT USAGE ON SCHEMA public TO expense_app;

-- Todo lo que cree el migrator queda con DML para la app, sin tener que acordarse en cada migración.
ALTER DEFAULT PRIVILEGES FOR ROLE expense_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO expense_app;
ALTER DEFAULT PRIVILEGES FOR ROLE expense_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO expense_app;
SQL
