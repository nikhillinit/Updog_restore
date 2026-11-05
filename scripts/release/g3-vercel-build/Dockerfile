# Linux amd64 manifest, resolved from the official Node image registry.
FROM --platform=linux/amd64 node:22.23.2-bookworm-slim@sha256:43aeff40f4afc22e83f7589a2f37e111cff5ca84529571f1c8415bcc5fcc21b2

# Preparation has registry access only. No candidate scripts or provider tools run.
ENV npm_config_registry=https://registry.npmjs.org \
    npm_config_cache=/opt/npm-cache \
    npm_config_ignore_scripts=true \
    npm_config_audit=false \
    npm_config_fund=false \
    npm_config_update_notifier=false
RUN npm install --global npm@10.9.2 --ignore-scripts \
    && test "$(node --version)" = v22.23.2 \
    && test "$(npm --version)" = 10.9.2
WORKDIR /opt/g3
COPY scripts/release/g3-vercel-build/package.json scripts/release/g3-vercel-build/package-lock.json ./
RUN npm ci --ignore-scripts
WORKDIR /opt/app
COPY package.json package-lock.json ./
RUN npm ci --include=dev --ignore-scripts \
    && mkdir /candidate /proof \
    && chown -R node:node /candidate /proof /opt/npm-cache

USER node
WORKDIR /candidate
ENV HOME=/tmp/g3-home TZ=UTC CI=1 VERCEL_TELEMETRY_DISABLED=1 \
    npm_config_offline=true
# The caller mounts only a reviewed exact-Git-object archive and a fresh proof dir.
# Outer timeout also bounds extraction, dependency copying and synchronous probes.
ENTRYPOINT ["timeout", "--signal=KILL", "660s", "sh", "-eu", "-c", "test -z \"$(ls -A /candidate)\"; test -z \"$(ls -A /proof)\"; tar --extract --file=/input/candidate.tar --directory=/candidate --no-same-owner; cp -a /opt/app/node_modules /candidate/node_modules; exec node /candidate/scripts/release/collect-g3-vercel-function-proof.mjs --expected-sha \"$1\" --output /proof/g3-vercel-function.json", "g3-vercel-proof"]
