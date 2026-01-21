# Fase 1: Build
FROM node:20-slim AS build

WORKDIR /app

# Installa le dipendenze
COPY package*.json ./
RUN npm install

# Accetta variabili d'ambiente al build time per Vite
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Copia il codice e costruisce l'app staticamente
COPY . .
RUN npm run build

# Fase 2: Service con Nginx
FROM nginx:alpine

# Crea un user non-root per security
RUN addgroup -g 1000 nginx && adduser -u 1000 -G nginx -s /sbin/nologin -D nginx

# Copia la build di Vite nella directory dei file statici di Nginx
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html

# Aggiungi una configurazione Nginx per gestire il routing SPA
RUN echo 'server { \
    listen 80; \
    location / { \
    root /usr/share/nginx/html; \
    index index.html index.htm; \
    try_files $uri $uri/ /index.html; \
    } \
    location /api { \
    proxy_pass http://backend:8000; \
    proxy_set_header Host $host; \
    proxy_set_header X-Real-IP $remote_addr; \
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
    } \
    }' > /etc/nginx/conf.d/default.conf

# Cambia user a nginx non-root
USER nginx

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
