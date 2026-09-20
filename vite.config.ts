import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { incomeVerificationApiPlugin } from './vite.incomeVerificationApi'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '')
  for (const key of [
    'OPENAI_API_KEY',
    'OPENAI_MODEL',
    'OPENAI_CLASSIFICATION_MODEL',
    'OPENAI_VISION_MODEL',
    'OPENAI_ESCALATION_MODEL',
    'BLOB_READ_WRITE_TOKEN',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
  ]) {
    if (env[key] && !process.env[key]) {
      process.env[key] = env[key]
    }
  }
  if (!process.env.SUPABASE_URL && process.env.VITE_SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL
  }
  if (!process.env.SUPABASE_ANON_KEY && process.env.VITE_SUPABASE_ANON_KEY) {
    process.env.SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
  }

  return {
    plugins: [react(), tailwindcss(), incomeVerificationApiPlugin()],
    resolve: {
      alias: {
        '@income-verification': path.resolve(rootDir, 'src/income-verification'),
      },
    },
  }
})
