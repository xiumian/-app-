import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import {
  assertProductionServerConfig,
  SERVER_HEADERS_TIMEOUT_MS,
  SERVER_HOST,
  SERVER_KEEP_ALIVE_TIMEOUT_MS,
  SERVER_PORT,
  SERVER_REQUEST_TIMEOUT_MS
} from './config.js';
import { handleRequest } from './router.js';
import { installGracefulShutdown } from './lifecycle.js';

export function configureServerTimeouts(server) {
  server.requestTimeout = SERVER_REQUEST_TIMEOUT_MS;
  server.headersTimeout = SERVER_HEADERS_TIMEOUT_MS;
  server.keepAliveTimeout = SERVER_KEEP_ALIVE_TIMEOUT_MS;
  return server;
}

export function createPetCompanionServer() {
  return configureServerTimeouts(createServer(handleRequest));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  assertProductionServerConfig();
  const server = createPetCompanionServer();
  server.listen(SERVER_PORT, SERVER_HOST, () => {
    console.log(`宠伴记 API 已启动：http://${SERVER_HOST}:${SERVER_PORT}`);
  });
  installGracefulShutdown(server);
}
