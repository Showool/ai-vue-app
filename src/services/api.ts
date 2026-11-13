export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  if (options.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin' })
  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new ApiError(response.status, '服务返回了无效响应，请稍后重试')
  }
  if (!response.ok) {
    const error = data && typeof data === 'object' && 'error' in data ? data.error : null
    throw new ApiError(response.status, typeof error === 'string' ? error : '请求失败，请稍后重试')
  }
  return data as T
}
