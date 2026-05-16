// vite.config.js

import unconscious from 'unconscious/VitePlugin.mjs';
import purgecss from 'unconscious/VitePurgeCSS.mjs';
import {viteSingleFile} from "vite-plugin-singlefile";

import packageInfo from "./package.json";

//https://cn.vite.dev/
export default {
    define: {
        APP_NAME: JSON.stringify(packageInfo.name),
        APP_VERSION: JSON.stringify(packageInfo.version),
    },

    plugins: [
        unconscious({
            exclude: ["vendor/*"]
        }),
        purgecss({
            safelist: [
            ]
        }),
        {
            name: 'inject-build-time',
            transformIndexHtml(html) {
                if (process.env.NODE_ENV === 'development') return html;

                const buildTime = new Date().toLocaleString();
                return html.replaceAll(/[\r\n]/g, "").replaceAll(/  +/g, " ").replace(
                    '</head>',
                    `<script>console.log("构建时间: ${buildTime}")</script></head>`
                );
            }
        },
        viteSingleFile()
    ],

    base: '', // 绝对路径什么的不要啊
    build: {
        modulePreload: { polyfill: false },
        //sourcemap: true,

        assetsInlineLimit: 512,
        rollupOptions: {
            output: {
                entryFileNames: `[name].[hash].js`,
                chunkFileNames: `[name].[hash].js`,
                assetFileNames: `[name].[hash].[ext]`,
            },
        }
    }
};