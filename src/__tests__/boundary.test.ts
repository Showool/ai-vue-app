import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { build, normalizePath } from 'vite'
import { localApi } from '../server/dev.ts'

const testKey = 'private-model-key-for-build-test'
const testPassword = 'private-password-for-build-test'
const testSessionSecret = 'private-session-secret-for-build-test'
const testLangSmithKey = 'private-langsmith-key-for-build-test'

async function buildFixture(source: string) {
  return build({
    configFile: false,
    logLevel: 'silent',
    plugins: [
      localApi([testKey, testPassword, testSessionSecret, testLangSmithKey]),
      {
        name: 'test-client-entry',
        resolveId(id) {
          if (id === 'virtual:entry') return '\0test-client-entry'
        },
        load(id) {
          if (id === '\0test-client-entry') return source
        },
      },
    ],
    build: { write: false, minify: false, rolldownOptions: { input: 'virtual:entry' } },
  })
}

test('client builds cannot import the server-side agent', async () => {
  const agentPath = normalizePath(fileURLToPath(new URL('../config/agent.ts', import.meta.url)))
  await assert.rejects(buildFixture(`import ${JSON.stringify(agentPath)}`), /只能在服务端运行/)
})

test('client builds fail if the model key enters an output asset', async () => {
  await assert.rejects(
    buildFixture(`console.log(${JSON.stringify(testKey)})`),
    /私密配置出现在浏览器构建产物/,
  )
})

test('client builds fail if a login password or session secret enters an output asset', async () => {
  for (const secret of [testPassword, testSessionSecret]) {
    await assert.rejects(
      buildFixture(`console.log(${JSON.stringify(secret)})`),
      /私密配置出现在浏览器构建产物/,
    )
  }
})

test('client builds fail if the LangSmith key enters an output asset', async () => {
  await assert.rejects(
    buildFixture(`console.log(${JSON.stringify(testLangSmithKey)})`),
    /私密配置出现在浏览器构建产物/,
  )
})

test('ordinary client code can build without exposing the model key', async () => {
  await assert.doesNotReject(buildFixture('console.log("public client code")'))
})
