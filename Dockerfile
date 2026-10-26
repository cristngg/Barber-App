# Filo: API + fotos + app en un solo servicio.
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3001 DATA_DIR=/data
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
# La base de datos y las fotos viven aquí: monta un volumen persistente.
VOLUME /data
EXPOSE 3001
CMD ["npx", "tsx", "server/index.ts"]
