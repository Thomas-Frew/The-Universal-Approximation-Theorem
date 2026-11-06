#!/usr/bin/env bash
# Builds GCC 15.3.0 (C and C++, for C++23) for the judge image. No prebuilt GCC
# this new runs on the image's Debian 10 (glibc 2.28), so it is compiled from
# source, inside the Judge0 image itself, so that it links against exactly
# the glibc it will run on. Output: /out/gcc-15.3.0.tar.gz.
#
# Takes about half an hour on 8 CPUs; on the 1-CPU judge it would take hours
# and could run out of memory, so run it on a temporary droplet:
#
#   doctl compute droplet create ua-gcc-build --size s-8vcpu-16gb-amd \
#     --image ubuntu-22-04-x64 --region sgp1 --ssh-keys <id> --wait
#   (install Docker, copy this script to /root, then:)
#   docker run --rm --user root --entrypoint bash -v /root/build-gcc.sh:/build.sh:ro \
#     -v /root/out:/out judge0/judge0:1.13.1 /build.sh
#
# then copy /root/out/gcc-15.3.0.tar.gz to the judge and destroy the droplet.
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive

# Buster is past end of life: its packages now live on archive.debian.org.
echo "deb http://archive.debian.org/debian buster main" > /etc/apt/sources.list
apt-get -o Acquire::Check-Valid-Until=false update
apt-get install -y --no-install-recommends make m4 xz-utils bzip2 file ca-certificates curl

# No sanitizers: buster's linker cannot link libhwasan, and nothing in the
# sandbox would use them.
# Built with the image's own GCC 9.2. No bootstrap (GCC rebuilding itself
# twice more): that only matters when the host compiler is untrusted.
export PATH=/usr/local/gcc-9.2.0/bin:$PATH CC=gcc CXX=g++ LD_LIBRARY_PATH=/usr/local/gcc-9.2.0/lib64
cd /tmp
curl -fsSLO https://gcc.gnu.org/pub/gcc/releases/gcc-15.3.0/gcc-15.3.0.tar.xz
curl -fsSL https://gcc.gnu.org/pub/gcc/releases/gcc-15.3.0/sha512.sum | grep " gcc-15.3.0.tar.xz$" | sha512sum -c -
tar -xJf gcc-15.3.0.tar.xz
# GMP, MPFR, MPC and ISL, checksummed by the script itself, built in-tree.
(cd gcc-15.3.0 && ./contrib/download_prerequisites)
mkdir build && cd build
../gcc-15.3.0/configure --prefix=/usr/local/gcc-15.3.0 --enable-languages=c,c++ \
  --disable-multilib --disable-bootstrap --disable-nls --disable-libsanitizer
make -j"$(nproc)"
make install-strip
tar -czf /out/gcc-15.3.0.tar.gz -C /usr/local gcc-15.3.0
echo BUILD-DONE
