FROM node:20.16.0-bookworm-slim@sha256:2d4585684de1a8483b91ed507cefb6270e8e0f3feff1a2d586e95d3e13c1af39
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

# v1.0.0 publishes no checksums: the hashes were taken from the release assets
RUN case "${TARGETARCH}" in \
      amd64) FOUNDRY_SHA256=8c078eaced6bfce76af902def65e36db677842ffbf53f76730647082a5b1e45a ;; \
      arm64) FOUNDRY_SHA256=79967815024de284265b9e82b75498b46357e597b93b481b9f4abe88a53eade6 ;; \
      *) exit 1 ;; \
    esac \
    && curl -fsSL -o /tmp/foundry.tar.gz "https://github.com/foundry-rs/foundry/releases/download/v1.0.0/foundry_v1.0.0_linux_${TARGETARCH}.tar.gz" \
    && echo "${FOUNDRY_SHA256}  /tmp/foundry.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/foundry.tar.gz -C /usr/local/bin \
    && rm /tmp/foundry.tar.gz
RUN npm ci
RUN forge install
