# the official image carries the toolchain, the repo is checked out at the requested commit
ARG SCRIPTS_IMAGE=ghcr.io/lidofinance/scripts:v22
FROM ${SCRIPTS_IMAGE}

ARG GITHUB_ORG=lidofinance
ARG GIT_SHA

RUN rm -rf /root/scripts
WORKDIR /root/scripts
RUN git init -q \
    && git remote add origin "https://github.com/${GITHUB_ORG}/scripts.git" \
    && git fetch -q --depth 1 origin "${GIT_SHA}" \
    && git checkout -q --detach FETCH_HEAD \
    && test "$(git rev-parse HEAD)" = "${GIT_SHA}"
LABEL org.opencontainers.image.revision="${GIT_SHA}"

RUN make init-scripts
