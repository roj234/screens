export const tabs = <div id={"tab-bar"}/>;
export const contentArea = <div id={"content"}/>;

let activeTabId = null;
let onChangeCallback = null;

export function setOnChange(onTabChange) {
	onChangeCallback = onTabChange;
}

function findTab(id, _tabs = tabs) {
	return _tabs.querySelector("[data-id=" + JSON.stringify(id) + "]");
}

export function addTab(id, name, closable) {
	if (findTab(id)) return;

	const tabEl = <div className={"tab"} data-id={id} title={name} onClick={() => switchTab(id)}>
		<span className={"tab-name"}>{name}</span>
	</div>;

	if (closable) {
		tabEl.appendChild(<span className={"tab-close"} title={"关闭标签页 (仅当前会话)"} onClick.stop={() => {
			closable();
			removeTab(id);
		}}>{'\u00d7'}</span>);
	}

	const contentEl = <div className={"tab-content"} data-id={id}/>;

	tabs.appendChild(tabEl);
	contentArea.appendChild(contentEl);
	return contentEl;
}

export function removeTab(id) {
	const tab = findTab(id);
	if (!tab) return;

	const previousItem = activeTabId === id && (tab.previousElementSibling || tabs.lastElementChild);

	tab.remove();
	findTab(id, contentArea).remove();

	if (previousItem) switchTab(previousItem.dataset.id);
}

export function switchTab(id) {
	if (activeTabId === id) return;

	const prevId = activeTabId;
	activeTabId = id;

	tabs.querySelector(".active")?.classList.remove("active");
	contentArea.querySelector(".active")?.classList.remove("active");

	findTab(id).classList.add("active");
	findTab(id, contentArea).classList.add("active");

	onChangeCallback(id, prevId);
}

export function updateTabName(id, name) {
	const tab = findTab(id);
	if (!tab) return;

	tab.title = name;
	tab.querySelector('.tab-name').textContent = name;
}

export const DESKTOP_TAB_ID = '__desktop__';