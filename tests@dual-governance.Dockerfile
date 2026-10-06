FROM nikolaik/python-nodejs:python3.10-nodejs18
USER root
ARG TARGETARCH

ARG GITHUB_ORG=lidofinance
ARG GIT_BRANCH=main
ARG BUILD_VERSION=latest

WORKDIR /root/
RUN echo "build tag: ${BUILD_VERSION}"
RUN git clone -b ${GIT_BRANCH} --single-branch https://github.com/${GITHUB_ORG}/dual-governance.git /root/dual-governance
# init script that runs when the container is started for the very first time
# it will install poetry, yarn libs and init brownie networks

WORKDIR /root/dual-governance

RUN curl -L https://foundry.paradigm.xyz | bash
ENV PATH="$PATH:/root/.foundry/bin"
RUN foundryup -i 1.0.0
RUN npm ci
RUN forge install

WORKDIR /root/dual-governance

# CMD ["/bin/bash", "-c", "env | grep -v 'no_proxy' >> /etc/environment && /root/init.sh && echo root:1234 | chpasswd && exec /usr/sbin/sshd -D"]