import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, requestJson } from '../services/api'

export const useAuthStore = defineStore('auth', () => {
  const username = ref<string | null>(null)
  const ready = ref(false)
  const isAuthenticated = computed(() => username.value !== null)

  async function restoreSession() {
    try {
      sessionStorage.removeItem('ai-workspace-user')
    } catch {
      // Old client-only sessions are no longer used for authentication.
    }
    try {
      const session = await requestJson<{ username: string | null }>('/api/auth', {
        signal: AbortSignal.timeout(10000),
      })
      username.value =
        typeof session.username === 'string' && session.username ? session.username : null
    } catch {
      username.value = null
    } finally {
      ready.value = true
    }
  }

  async function login(account: string, password: string): Promise<boolean> {
    try {
      const session = await requestJson<{ username: string }>('/api/auth', {
        method: 'POST',
        body: JSON.stringify({ username: account, password }),
        signal: AbortSignal.timeout(10000),
      })
      username.value =
        typeof session.username === 'string' && session.username ? session.username : null
      return isAuthenticated.value
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return false
      throw error
    }
  }

  async function logout() {
    await requestJson('/api/auth', { method: 'DELETE', signal: AbortSignal.timeout(10000) })
    username.value = null
  }

  return { username, ready, isAuthenticated, restoreSession, login, logout }
})
