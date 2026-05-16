import * as Tabs from "./tabs.js";
import {addTab} from "./tabs.js";
import * as Terminal from "./terminal.js";
import * as WSClient from "./ws-client.js";
import * as Desktop from "./desktop.js";
import {appendChildren} from "unconscious";

function init() {
	const dom = addTab(Tabs.DESKTOP_TAB_ID, "Desktop", false);
	dom.classList.add("desktop-tab");
	appendChildren(dom, Desktop.desktopElement);

	Tabs.setOnChange((newId, prevId) => {
		if (prevId && prevId !== Tabs.DESKTOP_TAB_ID) {
			const prevTerm = Terminal.getTerminalById(prevId);
			if (prevTerm) prevTerm.unsubscribe();
		}

		if (newId === Tabs.DESKTOP_TAB_ID) {
			Desktop.onActivate();
		} else {
			const newTerm = Terminal.getTerminalById(newId);
			if (newTerm) newTerm.subscribe();
		}
	});

	document.getElementById("app").replaceChildren(Tabs.tabs, Tabs.contentArea);

	WSClient.on('open', () => {
		Desktop.onDeactivate();
		Terminal.closeAllSessions();
		WSClient.send('get_sessions');
		WSClient.send('get_presets');

		Tabs.switchTab(Tabs.DESKTOP_TAB_ID);
	});

	WSClient.on('sessions', ({sessions}) => {
		for (const session of sessions) {
			Terminal.openSession(session);
		}
	});

	WSClient.on('session_created', ({session}) => {
		Terminal.openSession(session);
		Tabs.switchTab(session.id);
	});

	WSClient.on('session_history', Terminal.onHistory);
	WSClient.on('session_log', Terminal.onLog);
	WSClient.on('session_status', Terminal.onStatus);
	WSClient.on('session_last', Terminal.onLastLine);
	WSClient.on('close', Desktop.onDeactivate);

	WSClient.connect(import.meta.env.DEV ? "ws://localhost:3000" : location.href.replace("http", "ws"));
}


document.addEventListener('DOMContentLoaded', init);
