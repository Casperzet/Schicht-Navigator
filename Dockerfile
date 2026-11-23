# Schicht-Navigator Server – ein Container, keine Abhängigkeiten außer Node
FROM node:22-alpine
WORKDIR /app
COPY server/server.js server/server.js
COPY dist/index.html server/public/index.html
ENV PORT=8080 DATA_DIR=/data NODE_ENV=production
VOLUME ["/data"]
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "server/server.js"]
