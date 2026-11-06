FROM node:20.10.0-bookworm-slim

ARG TARGETARCH
ARG GITHUB_ORG=lidofinance
ARG GIT_SHA

RUN apt-get update && apt-get install -y --no-install-recommends git curl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app
RUN git init -q \
    && git remote add origin "https://github.com/${GITHUB_ORG}/staking-modules.git" \
    && git fetch -q --depth 1 origin "${GIT_SHA}" \
    && git checkout -q --detach FETCH_HEAD \
    && test "$(git rev-parse HEAD)" = "${GIT_SHA}"
LABEL org.opencontainers.image.revision="${GIT_SHA}"

RUN case "${TARGETARCH}" in amd64) JUST_ARCH=x86_64 ;; arm64) JUST_ARCH=aarch64 ;; *) exit 1 ;; esac \
    && curl -fsSL "https://github.com/casey/just/releases/download/1.24.0/just-1.24.0-${JUST_ARCH}-unknown-linux-musl.tar.gz" | tar -xz -C /usr/local/bin just \
    && FOUNDRY_VERSION="$(head -n 1 .foundryref)" \
    && curl -fsSL "https://github.com/foundry-rs/foundry/releases/download/${FOUNDRY_VERSION}/foundry_${FOUNDRY_VERSION}_linux_${TARGETARCH}.tar.gz" | tar -xz -C /usr/local/bin

RUN corepack enable && just deps && just build
