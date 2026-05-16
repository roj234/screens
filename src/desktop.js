import * as Charts from "./charts.js";
import * as WSClient from "./ws-client.js";
import {$foreach, $state} from "unconscious";

let systemSubscribed = false;

const presetsCache = $state([]);
const serverState = $state({});

/**
 * @type {HTMLElement}
 */
let cwd, cpuChartDiv, memChartDiv, intervalSelection, errorContainer;

export const desktopElement = <>
	<div className="desktop-left">
		<div className="card">
			<h3>快捷方式</h3>
			<div className="preset-buttons">
				{$foreach(presetsCache, preset => {
					const title = `Command: ${preset.command}\nDir: ${preset.workingDir || '(server cwd)'}\nMultiple: ${preset.allowMultiple ? 'yes' : 'no'}\nLog: ${preset.logSave || 'none'}`;

					return (<span className="preset-btn-wrap">
						<button
							className="preset-btn"
							title={title}
							onClick={() => {
								WSClient.send('create_session', {presetId: preset.id});
							}}
						>
							{preset.name}
							<span
								className="preset-delete"
								title="Delete preset"
								onClick.stop={(e) => {
									if (window.confirm(`Delete preset "${preset.name}"?`)) {
										WSClient.send('delete_preset', {id: preset.id});
										presetsCache.splice(presetsCache.indexOf(preset), 1);
									}
								}}
							>{'\u00D7'}</span>
						</button>
					</span>);
				})}
			</div>
			<div style:display={() => presetsCache.length ? "none" : "block"}
				 style="color:#666;font-size:12px;margin-top:8px;">
				No presets. Create one above.
			</div>
		</div>

		<div ref={errorContainer} className="card">
			<h3>新建快捷方式</h3>
			<form onSubmit.prevent={savePreset}>
				<div className="form-group">
					<label>名称</label>
					<input type="text" name={"name"} placeholder="My Command" required/>
				</div>
				<div className="form-group">
					<label>命令</label>
					<input type="text" name={"command"} placeholder="npm run build" required/>
				</div>
				<div className="form-group">
					<label>工作目录</label>
					<div className="path-row">
						<input type="text" name={"cwd"} ref={cwd}
							   placeholder="C:\path\to\project (leave empty for server CWD)"/>
						<button type="button" onClick={() => {
							const val = prompt('Enter working directory path:', cwd.value || '');
							if (val !== null) cwd.value = val;
						}}>Browse
						</button>
					</div>
				</div>
				<div className="form-row">
					<div className="checkbox-group">
						<input type="checkbox" name={"singleton"} checked={true}/>
						<label htmlFor="preset-multi">单例</label>
					</div>
					<div className="form-group" style="flex:0; min-width:160px;">
						<label>日志</label>
						<select name={"log"}>
							<option value="none">无</option>
							<option value="session">文件</option>
						</select>
					</div>
				</div>
				<button type="submit" className="btn btn-primary">保存</button>
			</form>
		</div>
	</div>

	<div className="desktop-right">
		<div className="card">
			<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
				<h3 style="margin-bottom:0;">系统状态</h3>
				<div className="freq-selector">
					<span>更新间隔:</span>
					<select onChange={(e) => {
						if (systemSubscribed) subscribeToSystem();
					}} ref={intervalSelection}>
						<option value="1000" selected>1s</option>
						<option value="2000">2s</option>
						<option value="5000">5s</option>
						<option value="10000">10s</option>
					</select>
				</div>
			</div>
			<div className="sys-info-grid">
				<div className="sys-card">
					<div className="sys-label">Server Time</div>
					<div className="sys-value">{() => serverState.time}</div>
				</div>
				<div className="sys-card">
					<div className="sys-label">Uptime</div>
					<div className="sys-value">{() => serverState.uptime}</div>
				</div>
				<div className="sys-card">
					<div className="sys-label">Memory</div>
					<div className="sys-value">{() => serverState.mem}</div>
				</div>
				<div className="sys-card">
					<div className="sys-label">CPU</div>
					<div className="sys-value">{() => serverState.cpu}</div>
				</div>
			</div>
			<div ref={cpuChartDiv}></div>
			<div ref={memChartDiv}></div>
		</div>
	</div>
</>;

const cpuChart = Charts.createChart(cpuChartDiv, 'CPU %', '#569cd6');
const memChart = Charts.createChart(memChartDiv, 'Memory %', '#4ec9b0');

WSClient.on('system_info', (msg) => {
	const usedGb = (msg.memory.used / (1024 * 1024 * 1024)).toFixed(1);
	const totalGb = (msg.memory.total / (1024 * 1024 * 1024)).toFixed(1);
	const mem = usedGb + ' / ' + totalGb + ' GB';

	serverState.value = {
		time: new Date(msg.time).toTimeString().slice(0, 8),
		uptime: msg.uptime,
		mem,
		cpu: msg.cpu.percent + '%'
	}

	cpuChart.push(msg.cpu.percent);
	memChart.push(msg.memory.percent);
});
WSClient.on('presets', ({presets}) => presetsCache.value = presets);
WSClient.on('error', ({error}) => {
	const div = <div className={'alert alert-error'}>{error}</div>
	setTimeout(() => {
		div.remove();
	}, 5000);
	errorContainer.prepend(div);
});

function savePreset(e) {
	const {
		name,
		command,
		cwd,
		singleton,
		log,
	} = e.target.elements;

	if (!name.value.trim() || !command.value.trim()) return;

	WSClient.send('save_preset', {
		preset: {
			name: name.value.trim(),
			command: command.value.trim(),
			workingDir: cwd.value.trim(),
			allowMultiple: !singleton.checked,
			logSave: log.value
		}
	});

	name.value = "";
	command.value = "";
	cwd.value = "";
}

function subscribeToSystem() {
	WSClient.send('sub_system', {interval: intervalSelection.value});
}

function onActivate() {
	if (!systemSubscribed) {
		systemSubscribed = true;
		subscribeToSystem();
	}
	if (cpuChart) cpuChart.resize();
	if (memChart) memChart.resize();
}

function onDeactivate() {
	if (systemSubscribed) {
		systemSubscribed = false;
		WSClient.send('unsub_system');
	}
}

export {onActivate, onDeactivate};