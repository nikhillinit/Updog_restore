# Minimal container wrapper for the wasm simulator CLI.
FROM node:20-alpine
WORKDIR /app
COPY package.json index.js ./
RUN chmod +x index.js
ENTRYPOINT ["node", "index.js"]