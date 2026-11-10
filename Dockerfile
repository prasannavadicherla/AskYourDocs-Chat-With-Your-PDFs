# Build the React client
FROM node:22-alpine AS client
WORKDIR /client
COPY client/package*.json ./
RUN npm install
COPY client/ .
RUN npm run build

# API server that also serves the built client
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY server/package*.json ./
RUN npm install --omit=dev
COPY server/ .
COPY --from=client /client/dist ./public
EXPOSE 4000
CMD ["sh", "-c", "node src/migrate.js && node src/index.js"]
