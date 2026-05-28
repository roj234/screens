import {mkdir, readFile, stat, writeFile} from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = path.normalize('data');
const PRESETS_FILE = path.join(DATA_DIR, 'presets.json');

let presets;
let readTime;

async function readPresets() {
	try {
		const lastMod = (await stat(PRESETS_FILE)).mtimeMs;
		if (presets && readTime === lastMod) return presets;

		readTime = lastMod;
		const raw = await readFile(PRESETS_FILE, 'utf8');
		return presets = JSON.parse(raw);
	} catch {
		return [];
	}
}

async function writePresets(presets) {
	await mkdir(DATA_DIR, { recursive: true });
	await writeFile(PRESETS_FILE, JSON.stringify(presets, null, 2), 'utf8');
	readTime = Date.now();
}

export async function getAll() {
	return await readPresets();
}

export async function save(preset) {
	const presets = await readPresets();
	if (!preset.id) {
		preset.id = crypto.randomUUID();
		presets.push(preset);
	} else {
		const idx = presets.findIndex(p => p.id === preset.id);
		if (idx >= 0) {
			presets[idx] = preset;
		} else {
			preset.id = crypto.randomUUID();
			presets.push(preset);
		}
	}
	await writePresets(presets);
	return preset;
}

export async function remove(id) {
	let presets = await readPresets();
	presets = presets.filter(p => p.id !== id);
	return writePresets(presets);
}

export async function getById(id) {
	const presets = await readPresets();
	return presets.find(p => p.id === id) || null;
}
