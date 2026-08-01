# Build context is the repo root: tsconfig maps @shared/* to ../shared, which a
# host/-scoped context cannot reach.
FROM node:20-alpine AS builder
WORKDIR /app/host

COPY host/package.json host/package-lock.json ./
RUN npm ci

COPY shared /app/shared
COPY host ./

# Next inlines NEXT_PUBLIC_* at build time, so the public origins have to be
# present here rather than in the compose environment.
ARG NEXT_PUBLIC_COMPANION_ORIGIN
ENV NEXT_PUBLIC_COMPANION_ORIGIN=$NEXT_PUBLIC_COMPANION_ORIGIN

RUN npm run build && npm prune --omit=dev

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app/host

COPY --from=builder --chown=node:node /app/shared /app/shared
COPY --from=builder --chown=node:node /app/host /app/host

USER node
EXPOSE 3000
CMD ["npm", "run", "start"]
