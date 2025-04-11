FROM nikolaik/python-nodejs:python3.10-nodejs18
USER root
ARG TARGETARCH

ARG GITHUB_ORG=lidofinance
ARG GIT_BRANCH=master
ARG BUILD_VERSION=latest

# install common prerequisites
RUN corepack prepare yarn@1.22 --activate
RUN poetry self update 1.8.2

WORKDIR /root/

RUN echo "build tag: ${BUILD_VERSION}"
RUN git clone -b ${GIT_BRANCH} --single-branch https://github.com/${GITHUB_ORG}/scripts.git /root/scripts
# init script that runs when the container is started for the very first time
# it will install poetry, yarn libs and init brownie networks
WORKDIR /root/scripts

RUN poetry install
RUN yarn
RUN poetry run brownie networks import network-config.yaml True
RUN poetry run brownie compile

# install & configure sshd
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y openssh-server && \
    mkdir /var/run/sshd

# set default working dir for ssh clients
RUN echo "cd /root/scripts" >> /root/.bashrc

WORKDIR /root/scripts

# start sshd, run init script, set root password for incoming connections and pass all ENV VARs from the container
# CMD ["/bin/bash", "-c", "env | grep -v 'no_proxy' >> /etc/environment && /root/init.sh && echo root:1234 | chpasswd && exec /usr/sbin/sshd -D"]