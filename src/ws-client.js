let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 10;
const RECONNECT_DELAY = 1000;
let reconnectTimer = null;
const handlers = new Map();
let url = '';

export function connect(wsUrl) {
	url = wsUrl;
	reconnectAttempts = 0;
	doConnect();
}

function doConnect() {
	if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
		return;
	}

	ws = new WebSocket(url);

	ws.onopen = () => {
		reconnectAttempts = 0;
		trigger('open', null);
	};

	ws.onmessage = (event) => {
		try {
			const msg = JSON.parse(event.data);
			if (msg.type) {
				trigger(msg.type, msg);
			}
			trigger('message', msg);
		} catch {
			trigger('raw', event.data);
		}
	};

	ws.onclose = () => {
		ws = null;
		if (reconnectAttempts < MAX_RECONNECT) {
			reconnectTimer = setTimeout(() => {
				reconnectAttempts++;
				doConnect();
			}, RECONNECT_DELAY * Math.pow(2, reconnectAttempts));
		}
		trigger('close', null);
	};

	ws.onerror = () => {
		trigger('error', {error: "WebSocket连接断开"});
	};
}

export function send(type, data) {
	if (!ws || ws.readyState !== WebSocket.OPEN) return false;
	const msg = JSON.stringify(data ? {type, ...data} : {type});
	ws.send(msg);
	return true;
}

export function on(type, callback) {
	if (!handlers.has(type)) handlers.set(type, [callback]);
	else handlers.get(type).push(callback);
}

function trigger(type, data) {
	const arr = handlers.get(type);
	if (arr) {
		for (const cb of arr) {
			try {
				cb(data);
			} catch {}
		}
	}
}