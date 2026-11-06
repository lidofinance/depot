FROM node:22-bookworm-slim

ARG GITHUB_ORG=lidofinance
ARG GIT_SHA

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app
RUN git init -q \
    && git remote add origin "https://github.com/${GITHUB_ORG}/stonks.git" \
    && git fetch -q --depth 1 origin "${GIT_SHA}" \
    && git checkout -q --detach FETCH_HEAD \
    && test "$(git rev-parse HEAD)" = "${GIT_SHA}"
LABEL org.opencontainers.image.revision="${GIT_SHA}"

RUN npm ci
COPY src/docker/stonks/hardhat.config.ts.template ./depot.hardhat.config.ts
RUN RPC_URL=http://127.0.0.1:8545 npx hardhat --config depot.hardhat.config.ts compile
