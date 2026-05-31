# Multi-stage build for the GetSign Node.js signing service.
# The app talks to SignServer/EJBCA purely over HTTP(S) now, so the image needs
# neither the Docker socket nor the docker CLI.

# ---- deps: install all dependencies (incl. dev) once ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

# ---- dev: hot-reloading dev server (ts-node-dev) ----
# Run with the source bind-mounted (see docker-compose.yml). `npm start` =
# ts-node-dev src/index.ts.
FROM node:22-bookworm-slim AS dev
WORKDIR /app
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 9999
CMD ["npm", "start"]

# ---- build: compile TypeScript -> dist + copy public assets ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- prod: lean runtime with only production deps + compiled output ----
FROM node:22-bookworm-slim AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 9999
CMD ["node", "dist/index.js"]
