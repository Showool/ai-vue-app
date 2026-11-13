import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

test('compiled API functions start and authenticate without TypeScript source files', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const temporaryRoot = path.join(root, 'node_modules', '.tmp')
  await mkdir(temporaryRoot, { recursive: true })
  const output = await mkdtemp(path.join(temporaryRoot, 'vercel-api-'))
  try {
    const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile)
    assert.equal(config.error, undefined)
    const converted = ts.convertCompilerOptionsFromJson(config.config.compilerOptions ?? {}, root)
    assert.deepEqual(converted.errors, [])
    const program = ts.createProgram({
      rootNames: ['api/auth.ts', 'api/chat.ts'].map((file) => path.join(root, file)),
      options: {
        ...converted.options,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        rootDir: root,
        outDir: output,
        noEmit: false,
      },
    })
    assert.equal(program.emit().emitSkipped, false)
    await writeFile(path.join(output, 'package.json'), JSON.stringify({ type: 'module' }))
    const result = spawnSync(
      process.execPath,
      [
        '--no-experimental-strip-types',
        '--input-type=module',
        '--eval',
        `
          import assert from 'node:assert/strict'
          import { createServer } from 'node:http'
          import { once } from 'node:events'
          import auth from './api/auth.js'
          import chat from './api/chat.js'
          const server = createServer((req, res) => {
            void (req.url === '/api/auth' ? auth(req, res) : chat(req, res))
          })
          server.listen(0, '127.0.0.1')
          await once(server, 'listening')
          const origin = 'http://127.0.0.1:' + server.address().port
          try {
            const login = await fetch(origin + '/api/auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: process.env.AUTH_USERNAME, password: process.env.AUTH_PASSWORD }),
            })
            assert.equal(login.status, 200)
            const cookie = login.headers.get('set-cookie').split(';')[0]
            const session = await fetch(origin + '/api/auth', { headers: { Cookie: cookie } })
            assert.deepEqual(await session.json(), { username: process.env.AUTH_USERNAME })
            const rejected = await fetch(origin + '/api/chat', { method: 'POST' })
            assert.equal(rejected.status, 401)
          } finally {
            await new Promise(resolve => server.close(resolve))
          }
        `,
      ],
      {
        cwd: output,
        encoding: 'utf8',
        timeout: 20000,
        windowsHide: true,
        env: {
          ...process.env,
          AUTH_USERNAME: 'deployment-fixture-owner',
          AUTH_PASSWORD: 'deployment-fixture-password',
          SESSION_SECRET: 'deployment-fixture-secret-with-more-than-32-characters',
          LANGSMITH_TRACING: 'false',
        },
      },
    )
    assert.ifError(result.error)
    assert.equal(result.status, 0, result.stderr || result.stdout)
  } finally {
    const relative = path.relative(temporaryRoot, output)
    assert.ok(relative.startsWith('vercel-api-') && !relative.includes(path.sep))
    await rm(output, { recursive: true, force: true })
  }
})
