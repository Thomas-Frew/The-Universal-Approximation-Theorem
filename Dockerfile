# syntax=docker/dockerfile:1
#
# The game, with the private levels repo baked in. Dokploy builds this from
# the public game repo. Everything except the levels comes from this repo (the
# build context); the levels are fetched from GitHub during the build.
#
# The private repo needs a read-only GitHub token, passed as the build secret
# GIT_AUTH_TOKEN (Dokploy: Environment > Build-time Secrets). A build secret is
# used for the fetch only: it is never written into the image or its history.
#
# The image holds machine source and hidden tests: never push it to a public
# registry.

# The levels, at a branch or tag. BuildKit checks the remote on every build,
# so a new commit there is picked up; nothing to bust by hand.
ARG LEVELS_REF=main
FROM scratch AS levels
ARG LEVELS_REF
ADD https://github.com/Thomas-Frew/TUAT-Problems.git#${LEVELS_REF} /

FROM node:24-bookworm-slim

# g++ compiles validators and C++ machines; python3 runs Python machines.
RUN apt-get update \
 && apt-get install -y --no-install-recommends g++ python3 \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /app

# Dependencies first, so a code change does not reinstall them.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @uat/web build

COPY --from=levels /levels.yaml /levels/levels.yaml
COPY --from=levels /include /levels/include
COPY --from=levels /levels /levels/levels

ENV LEVELS_DIR=/levels \
    CACHE_DIR=/app/apps/api/.cache \
    WEB_DIR=/app/apps/web/dist \
    PORT=8787 \
    NODE_ENV=production

# A broken level fails the build here, so it never replaces a working one.
# This also compiles every validator and machine into CACHE_DIR, so the API
# starts without compiling anything.
RUN pnpm verify

WORKDIR /app/apps/api
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD node -e "fetch('http://localhost:8787/healthz').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "src/index.ts"]
