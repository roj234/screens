import os from 'os';

let intervalHandle = null;
let subscribers = [];

function getCpuTimes() {
	const cpus = os.cpus();
	let totalIdle = 0;
	let totalTick = 0;
	for (const cpu of cpus) {
		for (const key of Object.keys(cpu.times)) {
			totalTick += cpu.times[key];
		}
		totalIdle += cpu.times.idle;
	}
	return {idle: totalIdle, total: totalTick};
}

let prevCpu = getCpuTimes();

export function collect() {
	const now = new Date();
	const uptimeSec = os.uptime();

	const days = Math.floor(uptimeSec / 86400);
	const hours = Math.floor((uptimeSec % 86400) / 3600);
	const minutes = Math.floor((uptimeSec % 3600) / 60);
	const seconds = Math.floor(uptimeSec % 60);
	const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;

	const totalMem = os.totalmem();
	const freeMem = os.freemem();
	const usedMem = totalMem - freeMem;
	const memPercent = Math.round((usedMem / totalMem) * 100 * 100) / 100;

	const currCpu = getCpuTimes();
	const idleDelta = currCpu.idle - prevCpu.idle;
	const totalDelta = currCpu.total - prevCpu.total;
	const cpuPercent = totalDelta > 0
		? Math.round((1 - idleDelta / totalDelta) * 100 * 100) / 100
		: 0;
	prevCpu = currCpu;

	return {
		time: now.toISOString(),
		uptime: uptimeStr,
		uptimeRaw: uptimeSec,
		memory: {
			total: totalMem,
			free: freeMem,
			used: usedMem,
			percent: memPercent
		},
		cpu: {
			percent: cpuPercent
		}
	};
}

export function start(interval = 1000) {
	stop();
	intervalHandle = setInterval(() => {
		const data = collect();
		for (const sub of subscribers) {
			sub(data);
		}
	}, interval);
}

export function stop() {
	if (intervalHandle) {
		clearInterval(intervalHandle);
		intervalHandle = null;
	}
}

export function subscribe(callback) {
	subscribers.push(callback);
	if (!intervalHandle) {
		start(1000);
	}
	callback(collect());

	return () => {
		const idx = subscribers.indexOf(callback);
		if (idx >= 0) subscribers.splice(idx, 1);
		if (subscribers.length === 0) {
			stop();
		}
	};
}
