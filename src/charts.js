export function createChart(containerEl, label, color, maxPoints) {
	if (!maxPoints) maxPoints = 60;

	/** @type {HTMLCanvasElement} */
	const canvas = <canvas/>;
	const wrapper = <div className={"chart-container"}>
		<div className={"chart-label"}>{label}</div>
		{canvas}
	</div>;

	containerEl.appendChild(wrapper);

	const data = [];
	let maxVal = 100;

	function resize() {
		const rect = wrapper.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;
		canvas.width = rect.width * dpr;
		canvas.height = rect.height * dpr;
		const ctx = canvas.getContext('2d');
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.scale(dpr, dpr);
		canvas.style.width = rect.width + 'px';
		canvas.style.height = rect.height + 'px';
		draw();
	}

	function draw() {
		const rect = wrapper.getBoundingClientRect();
		const w = rect.width;
		const h = rect.height;
		const ctx = canvas.getContext('2d');
		ctx.clearRect(0, 0, w, h);

		const padding = {top: 14, right: 16, bottom: 16, left: 36};
		const plotW = w - padding.left - padding.right;
		const plotH = h - padding.top - padding.bottom;

		if (plotW <= 0 || plotH <= 0) return;

		let dMax = maxVal;
		for (const v of data) {
			if (v > dMax) dMax = v;
		}
		dMax = Math.ceil(dMax / 10) * 10;
		if (dMax < 10) dMax = 10;

		ctx.strokeStyle = '#3c3c3c';
		ctx.lineWidth = 1;
		for (let i = 0; i <= 4; i++) {
			const y = padding.top + plotH - (i / 4) * plotH;
			ctx.beginPath();
			ctx.moveTo(padding.left, y);
			ctx.lineTo(w - padding.right, y);
			ctx.stroke();

			ctx.fillStyle = '#666';
			ctx.font = '9px Consolas, monospace';
			ctx.textAlign = 'right';
			const val = Math.round((dMax * i) / 4);
			ctx.fillText(val + '%', padding.left - 6, y + 3);
		}

		ctx.beginPath();
		ctx.strokeStyle = color;
		ctx.lineWidth = 1.5;
		const xStep = plotW / (maxPoints - 1);
		for (let i = 0; i < data.length; i++) {
			const x = padding.left + i * xStep;
			let y;
			if (dMax > 0) {
				y = padding.top + plotH - (data[i] / dMax) * plotH;
			} else {
				y = padding.top + plotH;
			}
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.stroke();

		ctx.fillStyle = color + '40';
		ctx.beginPath();
		if (data.length > 0) {
			const x0 = padding.left;
			const y0 = padding.top + plotH;
			ctx.moveTo(x0, y0);
			for (let i = 0; i < data.length; i++) {
				const x = padding.left + i * xStep;
				const y = dMax > 0
					? padding.top + plotH - (data[i] / dMax) * plotH
					: padding.top + plotH;
				ctx.lineTo(x, y);
			}
			ctx.lineTo(padding.left + (data.length - 1) * xStep, y0);
			ctx.closePath();
			ctx.fill();
		}
	}

	function push(val) {
		data.push(Math.max(0, Math.min(100, val)));
		while (data.length > maxPoints) data.shift();
		draw();
	}

	window.addEventListener('resize', resize);
	setTimeout(resize, 50);

	return {push, draw, resize};
}