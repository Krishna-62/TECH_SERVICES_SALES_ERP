import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    strictPort: true,
    // The API runs separately in development (npm run dev:api); same-origin in production.
    proxy: { '/api': 'http://localhost:4100' },
  },
});
