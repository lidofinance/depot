FROM node:20.16.0-bookworm-slim
ARG TARGETARCH

ARG GITHUB_ORG=lidofinance
ARG GIT_SHA

RUN apt-get update && apt-get install -y --no-install-recommends git curl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /root/dual-governance
RUN git init -q \
    && git remote add origin "https://github.com/${GITHUB_ORG}/dual-governance.git" \
    && git fetch -q --depth 1 origin "${GIT_SHA}" \
    && git checkout -q --detach FETCH_HEAD \
    && test "$(git rev-parse HEAD)" = "${GIT_SHA}"
LABEL org.opencontainers.image.revision="${GIT_SHA}"

RUN curl -L https://foundry.paradigm.xyz | bash
ENV PATH="$PATH:/root/.foundry/bin"
RUN foundryup -i 1.0.0
RUN npm ci
RUN forge install
