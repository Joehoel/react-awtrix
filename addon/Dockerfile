# The Supervisor builds this locally for the add-on. The app is pre-bundled by
# build.ts into a single `main.js`, so the image only needs the Bun runtime.
FROM oven/bun:1-alpine

WORKDIR /app
COPY main.js ./

CMD ["bun", "run", "main.js"]
