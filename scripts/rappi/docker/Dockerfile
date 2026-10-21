# Extractor Rappi para el servidor de n8n. Construir desde scripts/rappi:
#   docker build -f docker/Dockerfile -t rappi-extractor .
# Imagen oficial de Playwright con Chromium y dependencias de sistema (misma versión que playwright-core del repo).
FROM mcr.microsoft.com/playwright:v1.55.0-noble
ENV NODE_ENV=production TZ=America/Mexico_City ESTADO=/datos/sesion.json PUERTO=3100
WORKDIR /app
RUN npm init -y >/dev/null && npm install --omit=dev playwright-core@1.55.0 && mkdir -p /datos && chown pwuser:pwuser /datos
COPY api.mjs servidor.mjs ./
USER pwuser
VOLUME /datos
EXPOSE 3100
HEALTHCHECK --interval=5m --timeout=10s CMD node -e "fetch('http://127.0.0.1:3100/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "servidor.mjs"]
