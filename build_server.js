import {rollup} from 'rollup';
import path from 'path';
import {fileURLToPath} from 'url';
import serverPackageInfo from './package.json' with {type: 'json'};
import {nodeResolve} from 'unconscious/vite/build-backend.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverAbsPath = path.resolve(__dirname, 'dist/server.js');

const rollupConfig = {
	input: 'backend/server.js',
	external: [
		...Object.keys(serverPackageInfo.dependencies || {}),
	],
	plugins: [
		nodeResolve(),
		{
			name: 'my-plugin',
			resolveId(id, importer) {
				if (id.endsWith("/config.js")) return { id: './config.js', external: true };
			},
		}
	],
};

const bundle = await rollup(rollupConfig);
await bundle.write({
	file: serverAbsPath,
	format: 'esm',
	//compact: true,
});
console.log("Server built: ", serverAbsPath);