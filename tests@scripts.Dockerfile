# the official image carries the toolchain, the repo is cloned at the requested branch
ARG SCRIPTS_IMAGE=ghcr.io/lidofinance/scripts:v22
FROM ${SCRIPTS_IMAGE}

ARG GITHUB_ORG=lidofinance
ARG GIT_BRANCH=master
ARG BUILD_VERSION=latest

RUN echo "build tag: ${BUILD_VERSION}"
WORKDIR /root
RUN rm -rf /root/scripts \
    && git clone -b ${GIT_BRANCH} --single-branch https://github.com/${GITHUB_ORG}/scripts.git /root/scripts

WORKDIR /root/scripts

RUN make init-scripts
