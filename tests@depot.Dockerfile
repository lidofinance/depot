FROM node:22-alpine@sha256:0e1754758c2df4cfa3e68d59e2e1b7374bb7fd9ea6328eaaacf15cc934af8202

ARG NODE_VERSION=lts

ARG GITHUB_ORG=lidofinance
ARG GIT_BRANCH=main
ARG BUILD_TAG=latest

WORKDIR /usr/src/app

#CMD ["npm", "run", "omnibus:test", "--", "_example_omnibus"]
