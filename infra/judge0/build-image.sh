#!/usr/bin/env bash
# Builds the judge image (`Dockerfile` here) on the judge droplet. Run as root
# on the judge, after `install.sh`, with gcc-15.3.0.tar.gz from `build-gcc.sh`
# already in /opt/toolchains:
#
#   scp infra/judge0/{Dockerfile,build-image.sh} root@<judge>:/opt/toolchains/
#   ssh root@<judge> bash /opt/toolchains/build-image.sh
#
# Then point both Judge0 services at the image (`image:` in
# /opt/judge0-v1.13.1/docker-compose.yml) and `docker compose up -d`.
set -euo pipefail
cd /opt/toolchains

GO=go1.23.12.linux-amd64.tar.gz
GO_SHA256=d3847fef834e9db11bf64e3fb34db9c04db14e068eeb064f49af747010454f90
PY=cpython-3.10.22+20261009-x86_64-unknown-linux-gnu-install_only.tar.gz
PY_URL=https://github.com/astral-sh/python-build-standalone/releases/download/20261009
JDK=OpenJDK25U-jdk_x64_linux_hotspot_25.0.5_8.tar.gz
JDK_SHA256=68982529869257d0ee6b824ec5aa270ff8b118bb438670da0b97ebdab178d7fb
JDK_URL=https://github.com/adoptium/temurin25-binaries/releases/download/jdk-25.0.5%2B8

# Go, Python and the JDK are prebuilt and run on the image's glibc 2.28 as they are.
[ -f "$GO" ] || curl -fsSLO "https://go.dev/dl/$GO"
echo "$GO_SHA256  $GO" | sha256sum -c -
[ -f "$PY" ] || curl -fsSLO "$PY_URL/$PY"
curl -fsSL "$PY_URL/SHA256SUMS" | grep " $PY$" | sha256sum -c -
[ -f "$JDK" ] || curl -fsSLO "$JDK_URL/$JDK"
echo "$JDK_SHA256  $JDK" | sha256sum -c -
[ -f gcc-15.3.0.tar.gz ] || { echo "gcc-15.3.0.tar.gz missing: run build-gcc.sh first" >&2; exit 1; }

rm -rf go-1.23.12 python-3.10.22 jdk-25.0.5 gcc-15.3.0
mkdir go-1.23.12 python-3.10.22 jdk-25.0.5
tar -xzf "$GO" -C go-1.23.12 --strip-components=1
tar -xzf "$PY" -C python-3.10.22 --strip-components=1
tar -xzf "$JDK" -C jdk-25.0.5 --strip-components=1
tar -xzf gcc-15.3.0.tar.gz

# Only the toolchain folders are needed in the build context.
printf '*\n!gcc-15.3.0\n!go-1.23.12\n!python-3.10.22\n!jdk-25.0.5\n' > .dockerignore
docker build -t uat-judge0:1.13.1-toolchains-2 .
echo "Built uat-judge0:1.13.1-toolchains-2"
