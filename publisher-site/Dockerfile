# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN npm ci && npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
