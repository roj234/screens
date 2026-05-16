import * as Tabs from "./tabs.js";
import * as WSClient from "./ws-client.js";
import {$state, $store, appendChildren} from "unconscious";
import {VirtualList} from "unconscious/ext/VirtualList.js";



	const terminals = new Map();
const HISTORY_LIMIT = 100;

/**
 *
 * @param {string} id
 * @param {string} name
 * @param {number} lastLogId
 * @param {number} exitCode
 */
function createSession({id, name, lastLogId, exitCode: exitCode_, ...rest}) {
	lastLogId = Math.max(lastLogId - HISTORY_LIMIT, 0) || 0;

	let subscribed = false;
	let loadingHistory = false;
	let hasMoreHistory = true;
	let autoScroll = true;
	let moreLogIndicator;
	let historyIndex = -1;
	const commandHistory = [];

	const exitCode = $state(exitCode_);
	const lastLine = $state("");

	const getStatus = () => {
		const value = exitCode.value;
		return value == null ? "running" : value === 0 ? "completed" : "error ("+value+")";
	};
	const getPrefix = () => {
		const value = exitCode.value;
		return value == null ? '\u25B6 ' : value === 0 ? '\u2713 ' : '\u2717 ';
	};

	const onScroll = () => {
		if (loadingHistory) return;

		const {scrollTop, scrollHeight, clientHeight} = outputEl;

		if (scrollTop <= 5 && hasMoreHistory) loadOlderHistory();

		autoScroll = (scrollTop + clientHeight + 10) >= scrollHeight;

		if (moreLogIndicator && autoScroll) {
			moreLogIndicator.remove();
			moreLogIndicator = null;
		}
	}

	const loadOlderHistory = () => {
		const oldestId = logs.items[0]?.id || 1e10;
		if (oldestId <= 1) {
			hasMoreHistory = false;
			return;
		}

		loadingHistory = true;
		loaderEl.style.display = 'block';

		WSClient.send('get_history', {
			sessionId: id,
			beforeId: oldestId,
			limit: HISTORY_LIMIT
		});
	};

	const clearOutput = () => {
		logs.setItems([]);
		hasMoreHistory = false;
		moreLogIndicator?.remove();
		moreLogIndicator = null;
	};

	const showHistory = () => {
		if (!commandHistory.length) return;
		appendLogEntries(commandHistory.map((cmd, i) => ({
			id: -(i + 1),
			data: `${i + 1}. ${cmd}`,
		})));
	};

	const onInputKeydown = e => {
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			const hist = commandHistory;
			if (hist.length > 0) {
				if (historyIndex < 0) historyIndex = hist.length;
				if (historyIndex > 0) historyIndex--;
				inputEl.value = hist[historyIndex] || '';
			}
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			const hist = commandHistory;
			if (historyIndex >= 0 && historyIndex < hist.length - 1) {
				historyIndex++;
				inputEl.value = hist[historyIndex] || '';
			} else {
				historyIndex = -1;
				inputEl.value = '';
			}
		} else if (e.key === 'Enter') {
			if (!e.shiftKey) {
				e.preventDefault();
				const command = inputEl.value.trim();
				if (command) sendCommand(command);
			}
		} else if (e.key === 'l' && e.ctrlKey) {
			e.preventDefault();
			clearOutput();
		}
	};

	const sendCommand = command => {
		if (command.trim()) {
			const hist = commandHistory;
			if (hist.length >= HISTORY_LIMIT) hist.shift();
			const prevIndex = hist.indexOf(command);
			if (prevIndex >= 0) hist.splice(prevIndex, 1);
			hist.push(command);
			historyIndex = -1;

			WSClient.send('send', {sessionId: id, data: command + '\n'});
		}
		inputEl.value = '';
	};

	const content = Tabs.addTab(id, getPrefix() + name, () => closeSession(id));
	content.classList.add('terminal-tab');

	let outputEl, loaderEl, inputEl;

	appendChildren(content, [
		<div className="terminal-header">
			<div className="term-title">
				Command: <span>{rest.command}</span><br/>
				Dir: <span>{rest.workingDir}</span>
			</div>
			<div style="display:flex;align-items:center;gap:10px;">
				<span className={() => "terminal-status "+getStatus()}>{() => getStatus()}</span>
				<button className="btn btn-sm btn-danger" style:display={() => exitCode.value == null ? '' : 'none'} onClick={() => {
					WSClient.send('stop_session', {sessionId: id});
				}}>Stop</button>
			</div>
		</div>,
		<div className="terminal-output" ref={outputEl} onScroll={onScroll}>
			<div className="history-loader" ref={loaderEl} style="display:none;">
				Loading history...
			</div>
		</div>,
		<div className="terminal-input-area">
			<div className="terminal-input-row">
				<span className="terminal-prompt">&gt;</span>
				<textarea
					ref={inputEl}
					className="terminal-input"
					placeholder="输入命令，按Enter发送，Shift+Enter换行..."
					autocomplete="off"
					spellcheck={false}
					onKeydown={onInputKeydown}
				></textarea>
			</div>
			<div className="terminal-hints">
				<span>提示: 使用 ↑ 和 ↓ 箭头浏览历史</span>
				<button className="btn btn-sm btn-light" onClick={showHistory}>
					<svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16" style="vertical-align:text-bottom;">
						<path d="M8.515 1.019A7 7 0 0 0 8 1V0a8 8 0 0 1 .589.022l-.074.997zm2.004.45a7.003 7.003 0 0 0-.985-.299l.219-.976c.383.086.76.2 1.126.342l-.36.933zm1.37.71a7.01 7.01 0 0 0-.439-.27l.493-.87a8.025 8.025 0 0 1 .979.654l-.615.789a6.996 6.996 0 0 0-.418-.302zm1.834 1.79a6.99 6.99 0 0 0-.653-.796l.724-.69c.27.285.52.59.747.91l-.818.576zm.744 1.352a7.08 7.08 0 0 0-.214-.468l.893-.45a7.976 7.976 0 0 1 .45 1.088l-.95.313a7.023 7.023 0 0 0-.179-.483zm.53 2.507a6.991 6.991 0 0 0-.1-1.025l.985-.17c.067.386.106.778.116 1.17l-1 .025zm-.131 1.538c.033-.17.06-.339.081-.51l.993.123a7.957 7.957 0 0 1-.23 1.155l-.964-.267c.046-.165.086-.332.12-.501zm-.952 2.379c.184-.29.346-.594.486-.908l.914.405c-.16.36-.345.706-.555 1.038l-.845-.535zm-.964 1.205c.122-.122.239-.248.35-.378l.758.653a8.073 8.073 0 0 1-.401.432l-.707-.707z"/>
						<path d="M8 1a7 7 0 1 0 4.95 11.95l.707.707A8.001 8.001 0 1 1 8 0v1z"/>
						<path d="M7.5 3a.5.5 0 0 1 .5.5v5.21l3.248 1.856a.5.5 0 0 1-.496.868l-3.5-2A.5.5 0 0 1 7 9V3.5a.5.5 0 0 1 .5-.5z"/>
					</svg>
					命令历史
				</button>
				<span>，Ctrl+L</span>
				<button className="btn btn-sm btn-light" onClick={clearOutput}>
					<svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16" style="vertical-align:text-bottom;">
						<path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
						<path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
					</svg>
					清屏
				</button>
			</div>
		</div>
	]);

	const logs = new VirtualList({
		element: outputEl,
		itemHeight: 20,
		data: [],
		renderer(entry) {
			return <div className={"log-line"}>{entry.data}</div>;
		}
	});

	outputEl.append(<div className="log-line">{lastLine}</div>);

	const appendLogEntries = (entries, prepend) => {
		const items = logs.items;
		let isNotInitial = items.length;

		//for (let i = 0; i < 3; i++) entries.push(...entries);
		items[prepend ? "unshift" : "push"](...entries);
		const last = entries.at(-1);
		if (last.id > lastLogId) lastLogId = last.id;

		logs.setItems(items);

		if (!isNotInitial) logs.resize();
		if (prepend && isNotInitial) {
			loadingHistory = false;
			loaderEl.style.display = 'none';
			outputEl.scrollTop += 20 * entries.length;
			return;
		} else if (autoScroll) {
			outputEl.scrollTop = outputEl.scrollHeight;
		} else {
			if (!moreLogIndicator) {
				moreLogIndicator = <div className={"new-output-indicator"} onClick={() => {
					autoScroll = true;
					outputEl.scrollTop = outputEl.scrollHeight;
					moreLogIndicator.remove();
				}}>{"\u2193 New output (click to scroll)"}</div>
				outputEl.appendChild(moreLogIndicator);
			}
		}

		setLastLine("");
	};

	const setLastLine = (lastLine_) => {
		lastLine.value = lastLine_;
	};

	return {
		subscribe() {
			if (subscribed) return;
			subscribed = true;
			WSClient.send('subscribe', {sessionId: id, lastLogId});
		},
		unsubscribe(destroy) {
			if (destroy) logs.destroy();

			if (!subscribed) return;
			subscribed = false;
			WSClient.send('unsubscribe', {sessionId: id});
		},

		appendLogEntries,
		setLastLine,
		onExit(exitCode_) {
			exitCode.value = exitCode_;
			Tabs.updateTabName(id, getPrefix() + name);
		}
	}
}

export const onHistory = msg => {
	const t = terminals.get(msg.sessionId);
	if (!t) return;
	t.appendLogEntries(msg.entries, true);
};

export const onLog = msg => {
	const t = terminals.get(msg.sessionId);
	if (t) t.appendLogEntries(msg.entries, false);
};

export const onLastLine = msg => {
	const t = terminals.get(msg.sessionId);
	if (t) t.setLastLine(msg.lastLine);
};

export const onStatus = msg => {
	const t = terminals.get(msg.sessionId);
	if (!t) return;

	t.onExit(msg.exitCode);
};

export function openSession(session) {
	if (terminals.has(session.id)) return;

	const st = createSession(session);
	terminals.set(session.id, st);
}

export function closeSession(sessionId) {
	const st = terminals.get(sessionId);
	if (st) {
		st.unsubscribe(true);
		terminals.delete(sessionId);
		WSClient.send("remove_session", {sessionId});
	}
	Tabs.removeTab(sessionId);
}

export const closeAllSessions = () => {
	const ids = Array.from(terminals.keys());
	for (const sessionId of ids) {
		const st = terminals.get(sessionId);
		if (st) st.unsubscribe(true);
		Tabs.removeTab(sessionId);
	}
	terminals.clear();
};

export const getTerminalById = id => terminals.get(id);
