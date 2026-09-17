FROM oven/bun:1.4.2@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895

ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 \
    BUN_INSTALL_BIN=/usr/local/bin \
    PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/bun-node-fallback-bin

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates bubblewrap build-essential git node-gyp \
        openssh-client python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile \
    && cd node_modules/node-pty \
    && bun run install \
    && test -f build/Release/pty.node

COPY . .

EXPOSE 8899
CMD ["bun", "run", "start"]
