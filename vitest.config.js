import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';

export default defineConfig({
    plugins: [react(), svgr()],
    test: {
        environment: 'jsdom',
        globals: false,
        setupFiles: ['./src/test-setup.js'],
        include: ['src/**/*.test.js', 'src/**/*.test.jsx'],
        // Phosphor SVGs live in node_modules; inline them so svgr's
        // `?react` transform runs on them under vitest too.
        server: { deps: { inline: [/@phosphor-icons/] } },
    },
});
