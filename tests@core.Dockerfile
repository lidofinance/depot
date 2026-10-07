FROM node:22-bookworm-slim

ARG NODE_VERSION=lts
ARG YARN_VERSION=4.5.0

ARG GITHUB_ORG=lidofinance
ARG GIT_BRANCH=master
ARG BUILD_VERSION='latest'

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare yarn@${YARN_VERSION}

RUN echo "build tag: ${BUILD_VERSION}"
RUN git clone -b ${GIT_BRANCH} --single-branch https://github.com/${GITHUB_ORG}/core.git /usr/src/app

WORKDIR /usr/src/app

RUN cp .env.example .env

RUN yarn install --frozen-lockfile
RUN yarn run compile

#CMD ["yarn", "run", "test:integration:fork:mainnet"]