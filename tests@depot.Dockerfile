FROM node:22-alpine

ARG NODE_VERSION=lts
ARG PNPM_VERSION=9.11.0

ARG GITHUB_ORG=lidofinance
ARG GIT_BRANCH=main
ARG BUILD_TAG=latest

WORKDIR /usr/src/app

RUN npm install -g pnpm@${PNPM_VERSION}

#CMD ["pnpm", "omnibus:test", "_example_omnibus"]