FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY openapi.yaml ./openapi.yaml
ENV NODE_ENV=production
EXPOSE 8088
CMD ["node", "src/server.js"]
