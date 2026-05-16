import http from 'http';
import path from 'path';
import { readFile, stat } from 'fs/promises';
import { WebSocketServer } from 'ws';

import * as presetStore from './preset-store.js';
import * as procManager from './process-manager.js';
import { subscribe as subscribeSystemInfo } from './system-info.js';

const PUBLIC_HTML = path.normalize('dist/index.html');
const PORT = parseInt(process.env.PORT || '3000', 10);

let cachedHtml;
let cachedHtmlTimestamp;

const server = http.createServer((req, res) => {
	let urlPath = req.url.split('?')[0];
	if (urlPath !== '/') {
		res.writeHead(403);
		res.end();
		return;
	}

	stat(PUBLIC_HTML).then(async ({mtimeMs}) => {
		if (mtimeMs !== cachedHtmlTimestamp) {
			cachedHtmlTimestamp = mtimeMs;
			cachedHtml = await readFile(PUBLIC_HTML);
		}

		res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
		res.end(cachedHtml);
	}).catch(e => {
		res.writeHead(500);
		res.end(e.toString());
	})
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
	const clientSubscriptions = new Set();
	let systemUnsubscribe = null;

	ws.on('message', async (raw) => {
		let msg;
		try {
			msg = JSON.parse(raw.toString());
		} catch {
			return;
		}

		try {
			switch (msg.type) {
				case 'save_preset': {
					await presetStore.save(msg.preset);
				}
				// noinspection FallThroughInSwitchStatementJS
				case 'get_presets': {
					const presets = await presetStore.getAll();
					ws.send(JSON.stringify({ type: 'presets', presets }));
					break;
				}
				case 'delete_preset': {
					await presetStore.remove(msg.id);
					break;
				}

				case 'get_sessions': {
					const sessions = procManager.getAllSessions();
					ws.send(JSON.stringify({ type: 'sessions', sessions }));
					break;
				}

				case 'create_session': {
					const presetId = msg.presetId;
					const result = await procManager.createSession(presetId);
					if (result.error) {
						ws.send(JSON.stringify({ type: 'error', error: result.error }));
						break;
					}
					ws.send(JSON.stringify({ type: 'session_created', ...result }));
					break;
				}

				case 'stop_session': {
					const sessionId = msg.sessionId;
					const result = await procManager.stopSession(sessionId);
					if (result.error) {
						ws.send(JSON.stringify({ type: 'error', error: result.error }));
					}
					break;
				}

				case 'remove_session': {
					const sessionId = msg.sessionId;
					const result = procManager.removeSession(sessionId);
					if (result.error) {
						ws.send(JSON.stringify({ type: 'error', error: result.error }));
					}
					break;
				}

				case 'subscribe': {
					const sessionId = msg.sessionId;
					const session = procManager.getSession(sessionId);
					if (!session) break;

					procManager.subscribeSession(ws, sessionId);
					clientSubscriptions.add(sessionId);

					const entries = procManager.getLogsAfter(sessionId, msg.lastLogId || 0);
					ws.send(JSON.stringify({
						type: 'session_history',
						sessionId,
						entries
					}));

					const {lastLine} = session;
					if (lastLine) {
						ws.send(JSON.stringify({
							type: 'session_last',
							sessionId,
							lastLine
						}));
					}
					break;
				}

				case 'unsubscribe': {
					const sessionId = msg.sessionId;
					if (sessionId) {
						procManager.unsubscribeSession(ws, sessionId);
						clientSubscriptions.delete(sessionId);
					}
					break;
				}

				case 'get_history': {
					const sessionId = msg.sessionId;
					const beforeId = msg.beforeId;
					const limit = Math.min(msg.limit || 100, 500);
					if (!sessionId || !beforeId) break;

					const result = procManager.getHistoryBefore(sessionId, beforeId, limit);
					ws.send(JSON.stringify({
						type: 'session_history',
						sessionId,
						...result
					}));
					break;
				}

				case 'sub_system': {
					if (systemUnsubscribe) systemUnsubscribe();
					const interval = msg.interval || (msg.data && msg.data.interval) || 1000;
					let lastSent = 0;
					systemUnsubscribe = subscribeSystemInfo((data) => {
						const now = Date.now();
						if (now - lastSent < interval) return;
						lastSent = now;
						try {
							if (ws.readyState === 1) {
								ws.send(JSON.stringify({ type: 'system_info', ...data }));
							}
						} catch { /* ignore */ }
					});
					break;
				}

				case 'send': {
					const result = procManager.writeStdin(msg.sessionId, msg.data);
					if (result.error) {
						ws.send(JSON.stringify({ type: 'error', error: result.error }));
					}
					break;
				}

				case 'unsub_system': {
					if (systemUnsubscribe) {
						systemUnsubscribe();
						systemUnsubscribe = null;
					}
					break;
				}
			}
		} catch (err) {
			console.error(`Error handling message type ${msg.type}:`, err.message);
		}
	});

	ws.on('close', () => {
		for (const sessionId of clientSubscriptions) {
			procManager.unsubscribeSession(ws, sessionId);
		}
		if (systemUnsubscribe) {
			systemUnsubscribe();
			systemUnsubscribe = null;
		}
	});

	ws.on('error', () => {
		for (const sessionId of clientSubscriptions) {
			procManager.unsubscribeSession(ws, sessionId);
		}
		if (systemUnsubscribe) {
			systemUnsubscribe();
			systemUnsubscribe = null;
		}
	});
});

server.listen(PORT, () => {
	console.log(`Web Terminal server running at http://localhost:${PORT}`);
});

let shuttingDown = false;

async function gracefulShutdown() {
	if (shuttingDown) return;
	shuttingDown = true;
	console.log('正在终止子进程...');
	await procManager.stopAllSessions();
	process.exit(0);
}

// 监听 Ctrl+C (SIGINT)
process.on('SIGINT', gracefulShutdown);
// 监听 Kill 命令 (SIGTERM)
process.on('SIGTERM', gracefulShutdown);
