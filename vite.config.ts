import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { localApi } from './src/server/dev.ts'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  for (const key of [
    'OPENAI_API_KEY',
    'OPENAI_MODEL',
    'OPENAI_BASE_URL',
    'AUTH_USERNAME',
    'AUTH_PASSWORD',
    'SESSION_SECRET',
  ]) {
    if (env[key] !== undefined) process.env[key] = env[key]
  }
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('LANGSMITH_') || key === 'LANGCHAIN_CALLBACKS_BACKGROUND') {
      process.env[key] = value
    }
  }
  return {
    plugins: [
      vue(),
      localApi([env.OPENAI_API_KEY, env.AUTH_PASSWORD, env.SESSION_SECRET, env.LANGSMITH_API_KEY]),
    ],
  }
})
