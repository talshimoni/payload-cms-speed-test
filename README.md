# Payload vs Directus vs Strapi Speed Test

This repo benchmarks a heavy GraphQL document query across three CMSs:

1. Payload
2. Directus
3. Strapi

The query is intentionally deep and relation-heavy (groups, arrays, nested arrays, blocks, and multiple relation hops) to simulate real-world menu/layout fetching patterns.

## Requirements

1. Node `24.14.0` for Payload and Strapi (repo root contains `.nvmrc` / `.node-version`)
2. Node `22.x` for Directus (`isolated-vm@5.0.3` is not compatible with Node `24.x`)
3. Yarn classic (`1.x`)
4. Docker (for MongoDB/Postgres quick start)

## Install

From repo root:

```bash
yarn install
yarn --cwd ./payload install
yarn --cwd ./directus install
yarn --cwd ./strapi install
```

## Start Databases with Docker

Create and start MongoDB + Postgres:

```bash
docker run --name speedtest-mongo -p 27017:27017 -d mongo:7
docker run --name speedtest-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=postgres \
  -p 5432:5432 \
  -d postgres:16
```

Create required Postgres DBs:

```bash
docker exec -it speedtest-postgres psql -U postgres -c "CREATE DATABASE strapi;"
docker exec -it speedtest-postgres psql -U postgres -c "CREATE DATABASE directus;"
docker exec -it speedtest-postgres psql -U postgres -c "CREATE DATABASE payload_speed_test;"
```

## Setup Per CMS

### Payload (Mongo)

1. Copy [payload/.env.example](/Users/tal/Desktop/speed-test/payload/.env.example) to `payload/.env`
2. Ensure:
   `PAYLOAD_DB=mongo`
   `MONGODB_URI=mongodb://localhost:27017/payload-speed-test`
3. Start server: `yarn payload:run` (or `yarn payload:run:mongo`)
4. Run benchmark: `yarn payload:test`
5. Default GraphQL endpoint: `http://localhost:3000/api/graphql`

### Payload (Postgres)

1. Copy [payload/.env.example](/Users/tal/Desktop/speed-test/payload/.env.example) to `payload/.env`
2. Ensure:
   `PAYLOAD_DB=postgres`
   `POSTGRES_URL=postgres://postgres:postgres@localhost:5432/payload_speed_test`
3. Start server: `yarn payload:run` (or `yarn payload:run:postgres`)
4. Run benchmark: `yarn payload:test`
5. Default GraphQL endpoint: `http://localhost:3000/api/graphql`

### Directus

1. Switch to Node `22.x` and install deps for Directus:
   `fnm install 22 && fnm use 22 && yarn --cwd ./directus install`
2. Copy `directus/.env.example` to `directus/.env`
3. Restore dump (from repo root, tar-format dump):
   `pg_restore -h localhost -U postgres -d directus --clean --if-exists --no-owner --no-privileges ./directus/dump.sql`
4. Run migrations:
   `yarn --cwd ./directus exec directus database migrate:latest`
5. Start server: `yarn directus:run`
6. Seed (if needed): `yarn --cwd ./directus seed`
7. Run benchmark: `yarn directus:test`

### Strapi

1. Copy `strapi/.env.example` to `strapi/.env`
2. Start server: `yarn strapi:run`
3. Bootstrap + seed: `yarn strapi:bootstrap`
4. Run benchmark: `yarn strapi:test`

## Test CLI Options

All benchmarks are run from root via `test.ts`.

Examples:

```bash
yarn strapi:test
yarn strapi:test -- -v
yarn strapi:test -- --requests 50 -v

yarn payload:test -- -v
yarn directus:test -- --requests 200
```

Options:

1. `-v`, `--verbose`: print per-request status code and response bytes
2. `-n <number>`, `--requests <number>`, `--requests=<number>`: number of sequential requests (default `100`)
3. Optional base-url envs:
   `PAYLOAD_TEST_BASE_URL`, `DIRECTUS_TEST_BASE_URL`, `STRAPI_TEST_BASE_URL`
4. Optional explicit Payload GraphQL endpoint:
   `PAYLOAD_TEST_GRAPHQL_ENDPOINT`

Results are written to root as:

1. `results-payload.json`
2. `results-directus.json`
3. `results-strapi.json`

## Latest Local Results (March 2, 2026)

Unit: milliseconds, 100 sequential requests.

| Platform | Average | Max | Min | Total |
| -------- | ------- | --- | --- | ----- |
| Payload (Mongo) | 10.96 | 19 | 8 | 1103 |
| Payload (Postgres) | 13.62 | 29 | 9 | 1367 |
| Directus (Postgres) | 11.06 | 30 | 8 | 1107 |
| Strapi (Postgres) | 57.27 | 109 | 49 | 5731 |

## Notes

1. Strapi benchmark auth now uses an admin-created full-access API token for stable GraphQL permissions.
2. Strapi bootstrap/seed scripts are resilient and can auto-handle server startup cases.
3. For strict apples-to-apples comparisons, run all three stacks on similar hardware/DB placement and warm cache strategy.
