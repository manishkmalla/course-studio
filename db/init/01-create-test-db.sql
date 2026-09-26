-- Runs once when the db container's data volume is first initialized
-- (postgres docker-entrypoint-initdb.d convention). Creates the separate
-- database used by the API's test suite, alongside the dev database that
-- POSTGRES_DB already creates.
CREATE DATABASE course_studio_test;
