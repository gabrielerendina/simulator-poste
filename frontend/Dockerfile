# Fase 1: Build
FROM node:20-slim AS build

WORKDIR /app

# Installa le dipendenze
COPY package*.json ./
RUN npm install

# Accetta variabili d'ambiente al build time per Vite
ARG VITE_API_URL
ARG VITE_OIDC_AUTHORITY
ARG VITE_OIDC_CLIENT_ID
ARG VITE_OIDC_REDIRECT_URI
ARG VITE_OIDC_POST_LOGOUT_REDIRECT_URI

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_OIDC_AUTHORITY=$VITE_OIDC_AUTHORITY
ENV VITE_OIDC_CLIENT_ID=$VITE_OIDC_CLIENT_ID
ENV VITE_OIDC_REDIRECT_URI=$VITE_OIDC_REDIRECT_URI
ENV VITE_OIDC_POST_LOGOUT_REDIRECT_URI=$VITE_OIDC_POST_LOGOUT_REDIRECT_URI

# Copia il codice e costruisce l'app staticamente
COPY . .
RUN npm run build

# Fase 2: Service con Nginx
FROM nginx:alpine

# Backend hostname: "backend" for docker-compose, "backend-service" for Kubernetes
ARG BACKEND_HOST=backend

# Create nginx cache directories with correct permissions for non-root user
RUN mkdir -p /var/cache/nginx/client_temp \
    /var/cache/nginx/proxy_temp \
    /var/cache/nginx/fastcgi_temp \
    /var/cache/nginx/uwsgi_temp \
    /var/cache/nginx/scgi_temp \
    && chmod -R 777 /var/cache/nginx \
    && chmod -R 777 /var/run \
    && chmod -R 777 /etc/nginx/conf.d

# Copia la build di Vite nella directory dei file statici di Nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Aggiungi una configurazione Nginx per gestire il routing SPA e API proxy
RUN echo "server { \
    listen 80; \
    location /api/ { \
        proxy_pass http://${BACKEND_HOST}:8000/api/; \
        proxy_http_version 1.1; \
        proxy_set_header Upgrade \$http_upgrade; \
        proxy_set_header Connection \"upgrade\"; \
        proxy_set_header Host \$host; \
        proxy_set_header X-Real-IP \$remote_addr; \
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto \$scheme; \
    } \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files \$uri \$uri/ /index.html; \
    } \
    }" > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
