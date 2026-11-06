# Rebuild the locked esbuild versions: upstream binaries still embed vulnerable Go.
# Native compiler cross-compiles amd64; both official images are digest-pinned.
FROM --platform=$BUILDPLATFORM golang:1.27.3-alpine3.24@sha256:fa3d596898d9f126af7c01d14ee7597bab3f39cccf392ef36b69fe77cd681f18 AS esbuild-build
ENV CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOTOOLCHAIN=local
RUN go mod download github.com/evanw/esbuild@v0.25.12 github.com/evanw/esbuild@v0.27.0 \
    && cd /go/pkg/mod/github.com/evanw/esbuild@v0.25.12 \
    && go build -trimpath -ldflags="-s -w" -o /out/app/esbuild ./cmd/esbuild \
    && cd /go/pkg/mod/github.com/evanw/esbuild@v0.27.0 \
    && go build -trimpath -ldflags="-s -w" -o /out/g3/esbuild ./cmd/esbuild

FROM --platform=linux/amd64 node:22.23.4-alpine3.24@sha256:947e5454e08bfe0b8ddda604915ad76275276c774f47da90d0137252c793a778

# Preparation has registry access only. No candidate scripts or provider tools run.
ENV npm_config_registry=https://registry.npmjs.org \
    npm_config_cache=/opt/npm-cache \
    npm_config_ignore_scripts=true \
    npm_config_audit=false \
    npm_config_fund=false \
    npm_config_update_notifier=false
RUN npm install --global npm@11.21.2 --ignore-scripts \
    && test "$(node --version)" = v22.23.4 \
    && test "$(npm --version)" = 11.21.2
WORKDIR /opt/g3
COPY scripts/release/g3-vercel-build/package.json scripts/release/g3-vercel-build/package-lock.json ./
WORKDIR /opt/app
COPY package.json package-lock.json ./
# Replace binaries and remove the registry cache in the same layer as installation.
# The collector verifies these manifests before reusing the prepared dependency tree.
RUN --mount=type=bind,from=esbuild-build,source=/out,target=/rebuilt-esbuild \
    npm ci --prefix /opt/g3 --ignore-scripts \
    && npm ci --include=dev --ignore-scripts \
    && cp /rebuilt-esbuild/app/esbuild /opt/app/node_modules/@esbuild/linux-x64/bin/esbuild \
    && cp /rebuilt-esbuild/g3/esbuild /opt/g3/node_modules/@esbuild/linux-x64/bin/esbuild \
    && node -e 'for (const root of ["/opt/app", "/opt/g3"]) { const e = require(root + "/node_modules/esbuild"); const {execFileSync} = require("node:child_process"); if (execFileSync(root + "/node_modules/@esbuild/linux-x64/bin/esbuild", ["--version"], {encoding:"utf8"}).trim() !== e.version) throw new Error("esbuild version mismatch"); e.transformSync("const x: number = 1", {loader:"ts"}); }' \
    && npm ls --all --prefix /opt/g3 \
    && npm ls --all \
    && npm cache clean --force \
    && mkdir /candidate /proof \
    && chown -R node:node /candidate /proof /opt/npm-cache

USER node
WORKDIR /candidate
ENV HOME=/tmp/g3-home TZ=UTC CI=1 VERCEL_TELEMETRY_DISABLED=1 \
    npm_config_offline=true
# The caller mounts only a reviewed exact-Git-object archive and a fresh proof dir.
# Outer timeout also bounds extraction, dependency copying and synchronous probes.
ENTRYPOINT ["timeout", "-s", "KILL", "660", "sh", "-eu", "-c", "test -z \"$(ls -A /candidate)\"; test -z \"$(ls -A /proof)\"; tar -xof /input/candidate.tar -C /candidate; cmp /opt/app/package.json /candidate/package.json; cmp /opt/app/package-lock.json /candidate/package-lock.json; cp -a /opt/app/node_modules /candidate/node_modules; exec node /candidate/scripts/release/collect-g3-vercel-function-proof.mjs --expected-sha \"$1\" --output /proof/g3-vercel-function.json", "g3-vercel-proof"]
