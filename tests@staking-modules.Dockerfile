FROM node:20.10.0-bookworm-slim@sha256:5c714c3e90f66a2cbfa266b90a4d7adcd63453cd730aa2d13cba84b260bea2e6

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

# Foundry is pinned with its checksum: bump it here when .foundryref changes upstream
RUN FOUNDRY_VERSION=v1.5.1 \
    && case "${TARGETARCH}" in \
      amd64) JUST_ARCH=x86_64 \
        JUST_SHA256=2dec2a689872f7baf2b0a59c663463a33ac866272758d7d7c8c2b62ab5b32238 \
        FOUNDRY_SHA256=73640b01bd9ed29fdb4965085099371f8cf0dbbec3e2086cf54564efc4dcfe88 ;; \
      arm64) JUST_ARCH=aarch64 \
        JUST_SHA256=3cf0913a14f369dd6e927a7ba9d6c483a4d05df2cc353ed6aed593c6a50c667c \
        FOUNDRY_SHA256=cccf28bdf202289e837a9e21ed213b2b80dc1e806e12f1717bc98a44315c331e ;; \
      *) exit 1 ;; \
    esac \
    && if [ "$(head -n 1 .foundryref)" != "${FOUNDRY_VERSION}" ]; then \
      echo "staking-modules wants Foundry $(head -n 1 .foundryref), the image pins ${FOUNDRY_VERSION}" >&2; \
      exit 1; \
    fi \
    && curl -fsSL -o /tmp/just.tar.gz "https://github.com/casey/just/releases/download/1.24.0/just-1.24.0-${JUST_ARCH}-unknown-linux-musl.tar.gz" \
    && curl -fsSL -o /tmp/foundry.tar.gz "https://github.com/foundry-rs/foundry/releases/download/${FOUNDRY_VERSION}/foundry_${FOUNDRY_VERSION}_linux_${TARGETARCH}.tar.gz" \
    && printf '%s  /tmp/just.tar.gz\n%s  /tmp/foundry.tar.gz\n' "${JUST_SHA256}" "${FOUNDRY_SHA256}" | sha256sum -c - \
    && tar -xzf /tmp/just.tar.gz -C /usr/local/bin just \
    && tar -xzf /tmp/foundry.tar.gz -C /usr/local/bin \
    && rm /tmp/just.tar.gz /tmp/foundry.tar.gz

RUN corepack enable && just deps && just build
