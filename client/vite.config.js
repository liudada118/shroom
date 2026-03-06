import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs/promises';

export default defineConfig({
  plugins: [react()],
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
