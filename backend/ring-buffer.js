export class RingBuffer {
	constructor(maxSize) {
		this.buffer = [];
		this.maxSize = maxSize;
		this.head = 0;
		this.count = 0;
		this.nextId = 1;
		this.minId = 0;
	}

	push(entry) {
		const id = this.nextId++;
		const idx = (this.head + this.count) % this.maxSize;
		this.buffer[idx] = {id, ...entry};
		if (this.count < this.maxSize) {
			this.count++;
		} else {
			this.head = (this.head + 1) % this.maxSize;
			this.minId = id - this.maxSize + 1;
		}
		if (this.count === 1) {
			this.minId = id;
		}
		return id;
	}

	getBefore(beforeId, n) {
		if (this.count === 0) return {entries: [], hasMore: false};
		beforeId = Math.min(beforeId, this.nextId);
		if (beforeId <= this.minId) return {entries: [], hasMore: false};

		const entryMap = new Map();
		for (let i = 0; i < this.count; i++) {
			const idx = (this.head + i) % this.maxSize;
			const entry = this.buffer[idx];
			if (entry.id < beforeId) {
				entryMap.set(entry.id, entry);
			}
		}

		const ids = Array.from(entryMap.keys()).sort((a, b) => b - a);
		const limit = Math.min(n, ids.length);
		const entries = [];
		for (let i = 0; i < limit; i++) {
			entries.push(entryMap.get(ids[i]));
		}
		entries.reverse();

		return {
			entries,
			hasMore: limit < ids.length || ids[limit - 1] > this.minId
		};
	}

	getIdAfter(id) {
		if (this.count === 0) return [];
		const result = [];
		for (let i = 0; i < this.count; i++) {
			const idx = (this.head + i) % this.maxSize;
			if (this.buffer[idx].id > id) {
				result.push(this.buffer[idx]);
			}
		}
		return result;
	}

	getLastId() {
		if (this.count === 0) return 0;
		const lastIdx = (this.head + this.count - 1) % this.maxSize;
		return this.buffer[lastIdx].id;
	}

	size() {
		return this.count;
	}
}
