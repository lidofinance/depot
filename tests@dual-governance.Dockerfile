FROM node:20.16.0-bookworm-slim
ARG TARGETARCH

ARG GITHUB_ORG=lidofinance
ARG GIT_BRANCH=main
ARG BUILD_VERSION=latest

RUN apt-get update && apt-get install -y --no-install-recommends git curl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /root/
RUN echo "build tag: ${BUILD_VERSION}"
RUN git clone -b ${GIT_BRANCH} --single-branch https://github.com/${GITHUB_ORG}/dual-governance.git /root/dual-governance

WORKDIR /root/dual-governance

RUN curl -L https://foundry.paradigm.xyz | bash
ENV PATH="$PATH:/root/.foundry/bin"
RUN foundryup -i 1.0.0
RUN npm ci
RUN forge install
