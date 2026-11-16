-- Optional hardening (run once in the Supabase SQL editor as the postgres user).
-- Creates a login that can ONLY read the columns the analytics engine needs, so even a bug in
-- the application could not make analytics queries change data or read emails/phone numbers.
-- Then set ANALYTICS_DATABASE_URL to a connection string for this role.
-- Replace the password. Row-level isolation is still enforced by the application's org filter.

CREATE ROLE nexora_analytics LOGIN PASSWORD 'CHANGE_ME_LONG_RANDOM';
GRANT USAGE ON SCHEMA public TO nexora_analytics;
GRANT SELECT (id, organization_id, lead_id, salesperson_id, amount, sold_at) ON sales TO nexora_analytics;
GRANT SELECT (id, organization_id, city, source, status, priority, assigned_to, created_at) ON leads TO nexora_analytics;
GRANT SELECT (id, full_name) ON profiles TO nexora_analytics;
ALTER ROLE nexora_analytics SET default_transaction_read_only = on;
ALTER ROLE nexora_analytics SET statement_timeout = '5s';