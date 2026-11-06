# Judge0 1.13.1 with newer toolchains for players' code: C++23 (GCC 15.3.0),
# Go 1.23.12, Python 3.10.22 and Java 25 (Temurin 25.0.5). Judge0's own (GCC 9.2, Go 1.13, Python 3.8)
# stay in place, so an API still pointing at them keeps working during a
# switch-over. `apps/api/src/judge.ts` calls each toolchain by its path here.
#
# The build context is the folder `build-image.sh` fills: one directory per
# toolchain, already unpacked. Built on the judge droplet itself; never pushed
# to a registry (nothing secret is in it, but nothing needs it elsewhere).
FROM judge0/judge0:1.13.1

COPY gcc-15.3.0 /usr/local/gcc-15.3.0
COPY go-1.23.12 /usr/local/go-1.23.12
COPY python-3.10.22 /usr/local/python-3.10.22
COPY jdk-25.0.5 /usr/local/jdk-25.0.5

# Work done once here so that no submission has to do it (on the judge's one
# CPU, each took about 15 seconds per submission). The image runs Judge0 as
# `judge0`; these steps write to /usr/local, so they run as root.
USER root

# C++: a precompiled bits/stdc++.h. Parsing that header was nearly all of a
# compile; GCC uses the .gch beside it instead whenever the flags match, so
# these must be the same as the compile command in apps/api/src/judge.ts.
RUN /usr/local/gcc-15.3.0/bin/g++ -std=c++23 -O2 -x c++-header \
      /usr/local/gcc-15.3.0/include/c++/15.3.0/x86_64-pc-linux-gnu/bits/stdc++.h \
      -o /usr/local/gcc-15.3.0/include/c++/15.3.0/x86_64-pc-linux-gnu/bits/stdc++.h.gch

# Go: the standard library, compiled into a build cache. Go stopped shipping
# it precompiled in 1.20, so otherwise every submission compiles the runtime
# from scratch (slow, and bigger than the sandbox lets a file be). Same
# settings as the compile command in judge.ts, or the cache will not match.
RUN HOME=/tmp GOCACHE=/usr/local/go-1.23.12-cache GOTOOLCHAIN=local CGO_ENABLED=0 \
      /usr/local/go-1.23.12/bin/go build std \
    && chmod -R a+rX /usr/local/go-1.23.12-cache

USER judge0
