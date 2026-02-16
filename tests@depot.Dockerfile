FROM node:22-alpine

ARG NODE_VERSION=lts

ARG GITHUB_ORG=lidofinance
ARG GIT_BRANCH=main
ARG BUILD_TAG=latest

WORKDIR /usr/src/app

#CMD ["npm", "run", "omnibus:test", "_example_omnibus"]