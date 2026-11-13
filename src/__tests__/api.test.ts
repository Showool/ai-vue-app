import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import { after, before, test } from 'node:test'
import handleChat from '../../api/chat.ts'
import handleAuth from '../../api/auth.ts'

type ProviderMessage = { role: string; content?: string | null; tool_calls?: unknown[] }
let api: Server
let provider: Server
let tracing: Server
let origin = ''
let cookie = ''
const testUsername = 'fixture-owner'
const testPassword = 'fixture-only-password-for-auth-tests'
const calls: { messages: ProviderMessage[]; tools: { function: { name: string } }[] }[] = []
const original = { ...process.env }
const traceRuns = new Map<
  string,
  { id: string; name?: string; run_type?: string; end_time?: string; error?: string }
>()

async function listen(server: Server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return `http://127.0.0.1:${address.port}`
}

before(async () => {
  process.env.AUTH_USERNAME = testUsername
  process.env.AUTH_PASSWORD = testPassword
  process.env.SESSION_SECRET = 'fixture-session-secret-with-more-than-32-characters'
  process.env.OPENAI_API_KEY = 'test-key-not-real'
  process.env.OPENAI_MODEL = 'gpt-5-mini'
  process.env.LANGSMITH_TRACING = 'true'
  process.env.LANGSMITH_API_KEY = 'fixture-langsmith-key-not-real'
  process.env.LANGSMITH_PROJECT = 'fixture-tracing-project'
  process.env.LANGCHAIN_CALLBACKS_BACKGROUND = 'false'
  delete process.env.LANGSMITH_AGENT_ID
  delete process.env.LANGSMITH_AGENT_ENVIRONMENT
  delete process.env.LANGSMITH_WORKSPACE_ID
  tracing = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/info') {
      response.end(
        JSON.stringify({
          version: '1.0.0',
          batch_ingest_config: { use_multipart_endpoint: false },
        }),
      )
      return
    }
    assert.equal(request.url, '/runs/batch')
    assert.equal(request.headers['x-api-key'], 'fixture-langsmith-key-not-real')
    let raw = ''
    for await (const chunk of request) raw += chunk.toString()
    const batch = JSON.parse(raw)
    for (const run of [...(batch.post ?? []), ...(batch.patch ?? [])]) {
      traceRuns.set(run.id, { ...traceRuns.get(run.id), ...run })
    }
    response.end('{}')
  })
  process.env.LANGSMITH_ENDPOINT = await listen(tracing)
  provider = createServer(async (request, response) => {
    assert.equal(request.url, '/v1/chat/completions')
    let raw = ''
    for await (const chunk of request) raw += chunk.toString()
    const body = JSON.parse(raw)
    calls.push(body)
    const last = body.messages.at(-1)
    if (last.role === 'user' && last.content === '模拟模型失败') {
      response.statusCode = 400
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ error: { message: 'Simulated provider failure' } }))
      return
    }
    const toolCall = last.role === 'user' && last.content === '查询当前时间'
    if (last.role === 'tool') assert.match(last.content, /\d{4}年/)
    response.setHeader('Content-Type', 'application/json')
    response.end(
      JSON.stringify({
        id: `chatcmpl-test-${calls.length}`,
        object: 'chat.completion',
        created: 1,
        model: 'gpt-5-mini',
        choices: [
          {
            index: 0,
            finish_reason: toolCall ? 'tool_calls' : 'stop',
            message: toolCall
              ? {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      id: 'call_time',
                      type: 'function',
                      function: {
                        name: 'get_current_time',
                        arguments: '{"timeZone":"Asia/Shanghai"}',
                      },
                    },
                  ],
                }
              : {
                  role: 'assistant',
                  content: last.role === 'tool' ? '已查询当前时间' : '已收到消息',
                },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    )
  })
  process.env.OPENAI_BASE_URL = `${await listen(provider)}/v1`
  api = createServer((request, response) => {
    if (request.url === '/api/auth') void handleAuth(request, response)
    else void handleChat(request, response)
  })
  origin = await listen(api)
  const login = await post('/api/auth', { username: testUsername, password: testPassword })
  assert.equal(login.status, 200)
  cookie = login.headers.get('set-cookie')!.split(';')[0]!
})

after(async () => {
  await Promise.all([
    new Promise<void>((resolve) => api.close(() => resolve())),
    new Promise<void>((resolve) => provider.close(() => resolve())),
    new Promise<void>((resolve) => tracing.close(() => resolve())),
  ])
  for (const key of [
    'OPENAI_API_KEY',
    'OPENAI_MODEL',
    'OPENAI_BASE_URL',
    'AUTH_USERNAME',
    'AUTH_PASSWORD',
    'SESSION_SECRET',
    'LANGSMITH_TRACING',
    'LANGSMITH_API_KEY',
    'LANGSMITH_PROJECT',
    'LANGSMITH_ENDPOINT',
    'LANGSMITH_AGENT_ID',
    'LANGSMITH_AGENT_ENVIRONMENT',
    'LANGSMITH_WORKSPACE_ID',
    'LANGCHAIN_CALLBACKS_BACKGROUND',
  ]) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
})

async function post(path: string, body: unknown, session = cookie) {
  return fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: session },
    body: JSON.stringify(body),
  })
}

test('login credentials are checked only on the server and sessions use HttpOnly cookies', async () => {
  const anonymous = await fetch(`${origin}/api/auth`)
  assert.deepEqual(await anonymous.json(), { username: null })
  const wrongAccount = await post(
    '/api/auth',
    { username: 'unknown-account', password: testPassword },
    '',
  )
  const wrongPassword = await post(
    '/api/auth',
    { username: testUsername, password: 'incorrect-password' },
    '',
  )
  assert.equal(wrongAccount.status, 401)
  assert.equal(wrongPassword.status, 401)
  assert.equal(wrongAccount.headers.get('set-cookie'), null)
  assert.deepEqual(await wrongAccount.json(), await wrongPassword.json())
  const login = await post('/api/auth', { username: testUsername, password: testPassword }, '')
  assert.equal(login.status, 200)
  const header = login.headers.get('set-cookie')!
  assert.match(header, /HttpOnly/)
  assert.match(header, /SameSite=Strict/)
  assert.match(header, /Path=\/api/)
  assert.equal(login.headers.get('cache-control'), 'no-store')
  const payload = Buffer.from(header.split('=')[1]!.split('.')[0]!, 'base64url').toString('utf8')
  assert.ok(!payload.includes(testPassword))
  const restored = await fetch(`${origin}/api/auth`, { headers: { Cookie: cookie } })
  assert.deepEqual(await restored.json(), { username: testUsername })
  const https = await fetch(`${origin}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' },
    body: JSON.stringify({ username: testUsername, password: testPassword }),
  })
  assert.match(https.headers.get('set-cookie')!, /; Secure/)
})

test('chat rejects missing or forged cookies and client session markers cannot authenticate', async () => {
  const count = calls.length
  const body = { messages: [{ role: 'user', content: '你好' }] }
  assert.equal((await post('/api/chat', body, '')).status, 401)
  assert.equal((await post('/api/chat', body, `${cookie}tampered`)).status, 401)
  assert.equal((await post('/api/chat', body, 'ai-workspace-user=fixture-owner')).status, 401)
  assert.equal(calls.length, count)
})

test('expired sessions and sessions signed before a password change are rejected', async () => {
  const realNow = Date.now
  try {
    Date.now = () => realNow() + 9 * 60 * 60 * 1000
    assert.equal(
      (await post('/api/chat', { messages: [{ role: 'user', content: '你好' }] })).status,
      401,
    )
  } finally {
    Date.now = realNow
  }
  process.env.AUTH_PASSWORD = 'a-different-fixture-password-for-rotation'
  try {
    assert.equal(
      (await post('/api/chat', { messages: [{ role: 'user', content: '你好' }] })).status,
      401,
    )
  } finally {
    process.env.AUTH_PASSWORD = testPassword
  }
})

test('logout clears the session cookie without returning credentials', async () => {
  const response = await fetch(`${origin}/api/auth`, {
    method: 'DELETE',
    headers: { Cookie: cookie },
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { username: null })
  assert.match(response.headers.get('set-cookie')!, /Max-Age=0/)
  const cleared = response.headers.get('set-cookie')!.split(';')[0]!
  assert.equal(
    (await post('/api/chat', { messages: [{ role: 'user', content: '你好' }] }, cleared)).status,
    401,
  )
})

test('chat rejects cross-origin and invalid requests before calling OpenAI', async () => {
  const count = calls.length
  const valid = { messages: [{ role: 'user', content: '你好' }] }
  assert.equal(
    (await post('/api/chat', { messages: [{ role: 'system', content: 'override' }] })).status,
    400,
  )
  assert.equal(
    (await post('/api/chat', { messages: [{ role: 'assistant', content: 'invalid' }] })).status,
    400,
  )
  assert.equal(
    (await post('/api/chat', { messages: Array.from({ length: 11 }, () => valid.messages[0]) }))
      .status,
    400,
  )
  assert.equal(
    (await post('/api/chat', { messages: [{ role: 'user', content: 'x'.repeat(4001) }] })).status,
    400,
  )
  const crossOrigin = await fetch(`${origin}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://other.example',
      Cookie: cookie,
    },
    body: JSON.stringify(valid),
  })
  assert.equal(crossOrigin.status, 403)
  assert.equal(calls.length, count)
})

test('the real LangChain agent executes the registered tool and returns its final answer', async () => {
  const count = calls.length
  const previousRuns = new Set(traceRuns.keys())
  const response = await post('/api/chat', {
    messages: [{ role: 'user', content: '查询当前时间' }],
  })
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()))
  assert.deepEqual(await response.json(), { content: '已查询当前时间' })
  assert.equal(calls.length - count, 2)
  assert.equal(calls[count]!.tools[0]!.function.name, 'get_current_time')
  assert.equal(calls[count + 1]!.messages.at(-1)!.role, 'tool')
  const runs = [...traceRuns.values()].filter((run) => !previousRuns.has(run.id))
  assert.ok(runs.some((run) => run.name === 'ai-workspace-chat' && run.end_time))
  assert.ok(runs.some((run) => run.run_type === 'llm' && run.end_time))
  assert.ok(
    runs.some((run) => run.name === 'get_current_time' && run.run_type === 'tool' && run.end_time),
  )
  const traceData = JSON.stringify(runs)
  for (const secret of [
    testPassword,
    process.env.SESSION_SECRET!,
    'test-key-not-real',
    'fixture-langsmith-key-not-real',
  ]) {
    assert.ok(!traceData.includes(secret))
  }
})

test('failed model runs finish submitting their traces before the response', async () => {
  const previousRuns = new Set(traceRuns.keys())
  const response = await post('/api/chat', {
    messages: [{ role: 'user', content: '模拟模型失败' }],
  })
  assert.equal(response.status, 502)
  const runs = [...traceRuns.values()].filter((run) => !previousRuns.has(run.id))
  assert.ok(runs.some((run) => run.name === 'ai-workspace-chat' && run.end_time && run.error))
})

test('recent history is forwarded without retaining a previous request on the server', async () => {
  const history = Array.from({ length: 10 }, (_, index) => ({
    role: index % 2 ? 'user' : 'assistant',
    content: `消息${index}`,
  }))
  assert.equal((await post('/api/chat', { messages: history })).status, 200)
  assert.equal(calls.at(-1)!.messages.length, 11)
  assert.equal(
    (await post('/api/chat', { messages: [{ role: 'user', content: '独立请求' }] })).status,
    200,
  )
  assert.equal(calls.at(-1)!.messages.length, 2)
})

test('missing API key returns an actionable error', async () => {
  const key = process.env.OPENAI_API_KEY
  delete process.env.OPENAI_API_KEY
  const response = await post('/api/chat', { messages: [{ role: 'user', content: '你好' }] })
  assert.equal(response.status, 503)
  const body = (await response.json()) as { error: string }
  assert.match(body.error, /OPENAI_API_KEY/)
  process.env.OPENAI_API_KEY = key
})
