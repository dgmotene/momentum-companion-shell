# Build context is the repo root: tsconfig maps @shared/* to ../shared, which a
# companion/-scoped context cannot reach.
FROM node:20-alpine AS builder
WORKDIR /app/companion

COPY companion/package.json companion/package-lock.json ./
RUN npm ci

COPY shared /app/shared
COPY companion ./

# Next inlines NEXT_PUBLIC_* at build time. The backend URL in particular is
# fetched from the browser, so it must be the public origin, not a service name.
ARG NEXT_PUBLIC_HOST_ORIGIN
ARG NEXT_PUBLIC_COMPANION_BACKEND_URL
ENV NEXT_PUBLIC_HOST_ORIGIN=$NEXT_PUBLIC_HOST_ORIGIN
ENV NEXT_PUBLIC_COMPANION_BACKEND_URL=$NEXT_PUBLIC_COMPANION_BACKEND_URL

RUN npm run build && npm prune --omit=dev

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app/companion

COPY --from=builder --chown=node:node /app/shared /app/shared
COPY --from=builder --chown=node:node /app/companion /app/companion

USER node
EXPOSE 3001
CMD ["npm", "run", "start"]
