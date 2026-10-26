import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* En desarrollo, la API y las fotos las sirve `npm run dev:server` en el puerto 3001. */
const server = 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': server, '/uploads': server },
  },
});
