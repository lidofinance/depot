FROM node:22-bookworm-slim

ARG NODE_VERSION=lts
ARG YARN_VERSION=4.5.0

ARG GITHUB_ORG=lidofinance
ARG GIT_SHA

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare yarn@${YARN_VERSION}

WORKDIR /usr/src/app
RUN git init -q \
    && git remote add origin "https://github.com/${GITHUB_ORG}/core.git" \
    && git fetch -q --depth 1 origin "${GIT_SHA}" \
    && git checkout -q --detach FETCH_HEAD \
    && test "$(git rev-parse HEAD)" = "${GIT_SHA}"
LABEL org.opencontainers.image.revision="${GIT_SHA}"

RUN cp .env.example .env

RUN yarn install --frozen-lockfile
RUN yarn run compile

#CMD ["yarn", "run", "test:integration:fork:mainnet"]