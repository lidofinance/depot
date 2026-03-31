FROM node:18-bookworm-slim AS node
FROM python:3.10-slim-bookworm

COPY --from=node /usr/local /usr/local
RUN rm -f /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && npm install -g yarn@1.22.22 \
    && pip install poetry==1.8.2 \
    && apt-get update \
    && apt-get install -y openssh-server git gcc python3-dev \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir /var/run/sshd

ARG GITHUB_ORG=lidofinance
ARG GIT_BRANCH=master
ARG BUILD_VERSION=latest

RUN echo "build tag: ${BUILD_VERSION}"
RUN git clone -b ${GIT_BRANCH} --single-branch https://github.com/${GITHUB_ORG}/scripts.git /root/scripts

WORKDIR /root/scripts

RUN poetry install
RUN yarn
RUN poetry run brownie networks import network-config.yaml True
RUN poetry run brownie compile

# set default working dir for ssh clients
RUN echo "cd /root/scripts" >> /root/.bashrc

# start sshd, run init script, set root password for incoming connections and pass all ENV VARs from the container
# CMD ["/bin/bash", "-c", "env | grep -v 'no_proxy' >> /etc/environment && /root/init.sh && echo root:1234 | chpasswd && exec /usr/sbin/sshd -D"]