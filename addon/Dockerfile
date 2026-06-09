# The app is pre-bundled (by build.ts, or in CI) into a single `main.js`, so the
# image only needs the Bun runtime. BUILD_FROM is supplied by build.yaml (HA
# local builds and the CI builder); the default keeps plain `docker build` working.
ARG BUILD_FROM=oven/bun:1-alpine
FROM ${BUILD_FROM}

WORKDIR /app
COPY main.js ./

CMD ["bun", "run", "main.js"]
