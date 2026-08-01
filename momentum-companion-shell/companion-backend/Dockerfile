# Context is the repo root to match the other two images, though this service
# has no dependency on shared/.
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY companion-backend/package.json companion-backend/package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=node:node companion-backend ./

USER node
EXPOSE 4000
CMD ["node", "src/server.mjs"]
