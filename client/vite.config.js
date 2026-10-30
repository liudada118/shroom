import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs/promises';

// Bundle the same standalone pressure algorithm and statistic adapter used by
// the server. The local CommonJS objects avoid browser globals and runtime eval.
function dummyPressureModule() {
  const virtualId = 'virtual:dummy-pressure';
  const resolvedId = '\0' + virtualId;
  const sources = [
    path.resolve(__dirname, '../server/kpa/dummyPressure.v2.10.34.js'),
    path.resolve(__dirname, '../util/dummyPressureStatistics.js'),
  ];
  return {
    name: 'dummy-pressure-module',
    resolveId(id) { if (id === virtualId) return resolvedId; },
    async load(id) {
      if (id !== resolvedId) return null;
      sources.forEach(source => this.addWatchFile(source));
      const [algorithm, statistics] = await Promise.all(sources.map(source => fs.readFile(source, 'utf8')));
      return `const api = (() => { const module = { exports: {} };\n${algorithm}\nreturn module.exports; })();
const statistics = (() => { const module = { exports: {} };\n${statistics}\nreturn module.exports; })();
const adapter = statistics.createDummyPressureStatistics(api);
export const getDummyPressureResult = adapter.getDummyPressureResult;
export const getPressureValues = adapter.getPressureValues;
export default api;`;
    },
  };
}

export default defineConfig({
  plugins: [react(), dummyPressureModule()],
  root: '.',
  base: './',
  publicDir: 'public',
  server: {
    port: 3000,
    strictPort: false,
    host: '127.0.0.1',
    open: false,
  },
  build: {
    outDir: 'build',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  // 大写扩展名图片也作为资源处理
  assetsInclude: ['**/*.PNG', '**/*.JPG', '**/*.GIF', '**/*.JPEG'],
  // 让 .js 文件支持 JSX（transform 阶段）
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx?$/,
    exclude: [],
  },
  // 让 .js 文件支持 JSX（dependency scanning 阶段）
  optimizeDeps: {
    force: true,
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
      plugins: [
        {
          name: 'load-js-files-as-jsx',
          setup(build) {
            build.onLoad({ filter: /src\/.*\.js$/ }, async (args) => ({
              loader: 'jsx',
              contents: await fs.readFile(args.path, 'utf8'),
            }));
          },
        },
      ],
    },
  },
  // Vite 使用 import.meta.env.VITE_* 替代 CRA 的 process.env.REACT_APP_*
  // 通过 define 兼容旧代码中的 process.env 引用
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    'process.env.REACT_APP_API_PORT': JSON.stringify(process.env.REACT_APP_API_PORT || ''),
    'process.env.REACT_APP_WS_PORT': JSON.stringify(process.env.REACT_APP_WS_PORT || ''),
    'process.env.REACT_APP_SERVER_ADDRESS': JSON.stringify(process.env.REACT_APP_SERVER_ADDRESS || 'https://sensor.bodyta.com'),
  },
  css: {
    preprocessorOptions: {
      scss: {},
    },
  },
});
