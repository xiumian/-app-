FROM node:24-alpine

ENV NODE_ENV=production \
    PET_SERVER_HOST=0.0.0.0 \
    PET_SERVER_PORT=8787 \
    PET_SERVER_DATA_DIR=/data \
    PET_STORAGE_DRIVER=sqlite \
    PET_SQLITE_FILE=/data/pet-companion.sqlite \
    PET_SERVER_LOG_LEVEL=info

WORKDIR /app

COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server

RUN mkdir -p /data && chown -R node:node /data

USER node

VOLUME ["/data"]
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const port=process.env.PET_SERVER_PORT||8787; fetch('http://127.0.0.1:'+port+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "server:start"]
