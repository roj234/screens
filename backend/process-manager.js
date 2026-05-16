import { exec as execCb, spawn } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import path from 'path';
import { mkdir, appendFile } from 'fs/promises';
import { RingBuffer } from './ring-buffer.js';
import { getById } from './preset-store.js';
import {tokenize} from "./tokenizer.js";
import iconv from 'iconv-lite';

const exec = promisify(execCb);

const RING_BUFFER_SIZE = 10000;
const LOGS_DIR = path.normalize('data/logs');

const sessions = new Map();
const wsSubscribers = new Map();

function getLogDir(sessionId) {
	return path.join(LOGS_DIR, sessionId);
}

function getLogFile(sessionId) {
	return path.join(getLogDir(sessionId), 'output.log');
}

function ensureLogDir(sessionId) {
	const dir = getLogDir(sessionId);
	return mkdir(dir, { recursive: true });
}

function writeToLogFile(sessionId, stream, data, timestamp) {
	const date = new Date(timestamp);
	const timeStr = date.toTimeString().slice(0, 8);
	const line = `[${timeStr}] [${stream}] ${data}\n`;
	return appendFile(getLogFile(sessionId), line, 'utf8');
}

function pushLog(sessionId, stream, data) {
	const session = sessions.get(sessionId);
	if (!session) return;

	const timestamp = Date.now();
	const id = session.ringBuffer.push({ stream, data, timestamp });

	if (session.logSave === 'session') {
		writeToLogFile(sessionId, stream, data, timestamp).catch(err => {
			console.error(`Failed to write log for session ${sessionId}:`, err.message);
		});
	}

	const entries = [{ id, stream, data, timestamp }];
	broadcastToSession(sessionId, 'session_log', { entries });
}

function broadcastToSession(sessionId, type, data) {
	const subs = wsSubscribers.get(sessionId);
	if (!subs) return;
	for (const ws of subs) {
		try {
			if (ws.readyState === 1) {
				ws.send(JSON.stringify({ type, sessionId, ...data }));
			}
		} catch (err) {
			console.error(`Broadcast error for ${sessionId}:`, err.message);
		}
	}
}

export async function createSession(presetId) {
	const preset = await getById(presetId);
	if (!preset) return { error: 'Preset not found' };

	if (!preset.allowMultiple) {
		for (const [, s] of sessions) {
			if (s.presetId === presetId && s.exitCode == null) {
				return { error: `Preset "${preset.name}" is already running (multiple instances not allowed)` };
			}
		}
	}

	const sessionId = crypto.randomUUID();

	let cwd = preset.workingDir;
	if (!cwd) cwd = process.cwd();

	let childProcess;
	try {
		const [command, ...args] = tokenize(preset.command);

		childProcess = spawn(command, args, {
			cwd,
			stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
			windowsHide: true
		});
	} catch (err) {
		return { error: `Failed to spawn process: ${err.message}` };
	}

	if (preset.logSave === 'session') {
		await ensureLogDir(sessionId);
	}

	let stdoutBuf = '';
	let stderrBuf = '';

	const {charset = process.platform === 'win32' ? "gbk" : "utf8"} = preset;
	const stdoutStr = iconv.decodeStream(charset);
	const stderrStr = iconv.decodeStream(charset);
	const stdinStr = iconv.encodeStream(charset);

	childProcess.stdout.pipe(stdoutStr);
	childProcess.stderr.pipe(stderrStr);
	stdinStr.pipe(childProcess.stdin);

	const session = {
		id: sessionId,
		presetId,
		name: preset.name,
		command: preset.command,
		workingDir: cwd,
		exitCode: null,
		pid: childProcess.pid,
		child: childProcess,
		stdin: stdinStr,
		ringBuffer: new RingBuffer(RING_BUFFER_SIZE),
		logSave: preset.logSave || 'none',
		createdAt: Date.now()
	};

	sessions.set(sessionId, session);
	wsSubscribers.set(sessionId, new Set());

	stdoutStr.on('data', (data) => {
		stdoutBuf += data;
		const lines = stdoutBuf.split('\n');
		stdoutBuf = lines.pop();
		for (const line of lines) {
			pushLog(sessionId, 'stdout', line);
		}

		session.lastLine = stdoutBuf;
		if (stdoutBuf) {
			broadcastToSession(sessionId, 'session_last', {lastLine: stdoutBuf});
		}
	});

	stderrStr.on('data', (data) => {
		stderrBuf += data;
		const lines = stderrBuf.split('\n');
		stderrBuf = lines.pop();
		for (const line of lines) {
			pushLog(sessionId, 'stderr', line);
		}

		session.lastLine = stderrBuf;
		if (stderrBuf) {
			broadcastToSession(sessionId, 'session_last', {lastLine: stderrBuf});
		}
	});

	childProcess.on('close', (code) => {
		if (stdoutBuf) pushLog(sessionId, 'stdout', stdoutBuf);
		if (stderrBuf) pushLog(sessionId, 'stderr', stderrBuf);
		session.lastLine = stdoutBuf = stderrBuf = '';

		const exitCode = code !== null ? code : -1;
		session.exitCode = exitCode;

		const statusLine = `--- Process exited with code ${exitCode} at ${new Date().toISOString()} ---`;
		pushLog(sessionId, 'stderr', statusLine);

		broadcastToSession(sessionId, 'session_status', { exitCode });
	});

	childProcess.on('error', (err) => {
		session.exitCode = -1;
		pushLog(sessionId, 'stderr', `--- Process error: ${err.message} ---`);
		broadcastToSession(sessionId, 'session_status', { exitCode: -1 });
	});

	return {
		session: sessionToFrontendFormat(session)
	};
}

export function removeSession(sessionId) {
	const session = sessions.get(sessionId);
	if (!session) return { error: 'Session not found' };
	if (session.exitCode == null) return { error: 'Session is running' };
	sessions.delete(sessionId);
	return { success: true };
}

export async function stopSession(sessionId) {
	const session = sessions.get(sessionId);
	if (!session) return { error: 'Session not found' };
	if (session.exitCode != null) return { error: 'Session is not running' };

	try {
		killed:
		if (process.platform === 'win32') {
			try {
				session.child.send?.('shutdown');
			} catch {}
			try {
				await exec(`taskkill /PID ${session.pid}`, { windowsHide: true });
			} catch {}

			for (let i = 0; i < 10; i++) {
				try {
					process.kill(session.pid, 0);
					await new Promise(resolve => setTimeout(resolve, 100));
				} catch {
					break killed;
				}
			}

			console.log("force kill pid "+session.pid);
			await exec(`taskkill /F /T /PID ${session.pid}`, { windowsHide: true });
		} else {
			session.child.kill('SIGTERM');
		}

		return { success: true };
	} catch (err) {
		return { error: `Failed to stop: ${err.message}` };
	}
}

export function subscribeSession(ws, sessionId) {
	if (!sessions.has(sessionId)) return false;
	if (!wsSubscribers.has(sessionId)) {
		wsSubscribers.set(sessionId, new Set());
	}
	wsSubscribers.get(sessionId).add(ws);
	return true;
}

export function unsubscribeSession(ws, sessionId) {
	const subs = wsSubscribers.get(sessionId);
	if (subs) subs.delete(ws);
}

export function stopAllSessions() {
	return Promise.all(Array.from(sessions.values()).filter(item => item.exitCode == null).map(item => stopSession(item.id)));
}

export function getHistoryBefore(sessionId, beforeId, limit = 50) {
	const session = sessions.get(sessionId);
	if (!session) return { entries: [], hasMore: false };
	return session.ringBuffer.getBefore(beforeId, limit);
}

export function getLogsAfter(sessionId, lastLogId) {
	const session = sessions.get(sessionId);
	if (!session) return [];
	return session.ringBuffer.getIdAfter(lastLogId || 0);
}

export function getSession(sessionId) {
	return sessions.get(sessionId);
}

export function writeStdin(sessionId, data) {
	const session = sessions.get(sessionId);
	if (!session || session.exitCode != null) return { error: 'Session not found or not running' };

	try {
		session.stdin.write(data);
		return { success: true };
	} catch (err) {
		return { error: `Failed to write stdin: ${err.message}` };
	}
}

function sessionToFrontendFormat(session) {
	return {
		id: session.id,
		presetId: session.presetId,
		name: session.name,
		command: session.command,
		workingDir: session.workingDir,
		exitCode: session.exitCode,
		createdAt: session.createdAt,
		lastLogId: session.ringBuffer.getLastId()
	};
}

export function getAllSessions() {
	const result = [];
	for (const [, session] of sessions) {
		result.push(sessionToFrontendFormat(session));
	}
	return result;
}
