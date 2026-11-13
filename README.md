# AI Workspace

基于 Vue 3、TypeScript、Pinia 和 Element Plus 的 AI 对话工作空间。

## 在线访问

[https://ai-vue-app.vercel.app/](https://ai-vue-app.vercel.app/)

## 使用说明

运行 `npm install`，在 `.env.local` 中填写 `OPENAI_API_KEY`，再运行 `npm run dev`，访问终端显示的本地地址。Vite 同时提供页面和 `/api/chat` 本地接口，无需额外启动后端。

登录账号、密码和会话密钥只在服务端环境变量中配置，不提供公开的默认凭据。浏览器通过 `/api/auth` 登录，并使用 HttpOnly Cookie 恢复会话；修改浏览器存储无法绕过服务端校验。

登录后可以收起或展开侧边栏，进入「AI → AI 对话」，输入消息、点击发送或按 Enter 发送，Shift + Enter 换行。输入框默认单行，内容超出时自动增高。点击三个推荐问题可填入输入框。页面只保留一个对话；右上角的重置图标在悬停时显示「重置对话」，点击后清空消息、输入内容及本地历史，并取消正在进行的回复。

## 环境变量与 Vercel

只使用 `.env.local` 保存实际配置，`.env.example` 是可提交的模板。`.env.local` 已加入 Git 忽略规则，不会随源码提交。

| 变量              | 作用                                               |
| ----------------- | -------------------------------------------------- |
| `OPENAI_API_KEY`  | 必填，仅服务端读取                                 |
| `OPENAI_MODEL`    | 对话模型，默认 `gpt-5-mini`                        |
| `OPENAI_BASE_URL` | 可选，自定义兼容接口地址；留空使用 OpenAI 官方地址 |
| `AUTH_USERNAME`   | 服务端登录账号                                     |
| `AUTH_PASSWORD`   | 服务端登录密码，请设置独立的强密码                 |
| `SESSION_SECRET`  | 至少 32 字符的随机会话签名密钥                     |

OpenAI Key、登录密码和会话签名密钥仅由服务端读取，不使用 `VITE_` 前缀。`src/config/agent.ts`、`src/config/tools.ts` 和 `src/server/` 都只能由服务端导入。Vite 会拦截浏览器对这些模块的导入，并在检测到私密配置进入构建产物时阻止构建。对话接口也会检查登录会话。

Vercel 部署步骤：

1. 在 `.env.local` 中填写模型和登录配置。
2. 在 Vercel 项目的 Settings → Environment Variables 中直接导入 `.env.local`，并选择需要的 Production / Preview 环境。
3. 使用 Vite 框架，构建命令 `npm run build`，输出目录 `dist`。根目录 `api/auth.ts`、`api/chat.ts` 是最小 Node.js Function 入口，实际逻辑在 `src/server/`。私密配置由 Vercel 运行时环境注入。
4. 新增或修改环境变量后重新部署。若凭据曾公开，应更换凭据；只修改文档无法撤回已经公开的信息。

根 `tsconfig.json` 中的 `rewriteRelativeImportExtensions` 用于把函数及其依赖的 `.ts` 导入重写为编译后的 `.js` 路径，避免部署后出现 `ERR_MODULE_NOT_FOUND`。根配置同时指定 Node 类型和 ES2023 编译目标。[Vercel Node.js 运行时](https://vercel.com/docs/functions/runtimes/node-js#using-typescript-with-the-nodejs-runtime)不支持 TypeScript Project References，因此这些选项保留在根文件中。

## Agent 与工具扩展

接入参考 [LangChain JavaScript Quickstart](https://docs.langchain.com/oss/javascript/langchain/quickstart) 和 [ChatOpenAI 集成](https://docs.langchain.com/oss/javascript/integrations/chat/openai)，使用 `createAgent`、`ChatOpenAI` 和 `tool`。模型与工具只在服务端运行，浏览器请求 `/api/chat` 获取最终回答。请求失败可重试，重试不会重复添加用户消息。

`src/config/tools.ts` 提供 `get_current_time` 工具。添加工具时，使用 `tool(处理函数, { name, description, schema })` 和 Zod 定义参数，再加入该文件的 `agentTools` 数组即可。工具由 Agent 自动选择执行，客户端不能提交可执行工具定义。

## LangSmith 追踪

参考 [LangChain 官方追踪文档](https://docs.langchain.com/langsmith/trace-with-langchain)。在 `.env.local` 中设置 `LANGSMITH_TRACING=true`、`LANGSMITH_API_KEY` 以及追踪目标：Project 工作区使用 `LANGSMITH_PROJECT`；Agent 工作区使用 `LANGSMITH_AGENT_ID` 和 `LANGSMITH_AGENT_ENVIRONMENT`，两种目标不要同时配置。

本地开发和预览会将 `LANGSMITH_*`、`LANGCHAIN_CALLBACKS_BACKGROUND` 加载到服务端。修改后重启开发服务器。Vercel 中配置相同变量并重新部署，建议 `LANGCHAIN_CALLBACKS_BACKGROUND=false`。Agent 会在请求结束前等待追踪回调提交，运行名称为 `ai-workspace-chat`，可在 LangSmith 中查看模型和工具调用。

非默认区域通过 `LANGSMITH_ENDPOINT` 指定地址，例如 APAC 工作区使用 `https://apac.api.smith.langchain.com`，地址区域必须与工作区一致。Key 关联多个工作区时配置 `LANGSMITH_WORKSPACE_ID`。LangSmith Key 仅供服务端使用，并纳入构建产物泄露检查。开启追踪会向 LangSmith 上传 Agent 的输入、输出及工具调用；不会主动发送登录表单或环境文件内容。

## 目录结构

```text
src/
  config/        Agent 和工具配置（仅服务端使用）
  server/        最小模型代理、请求校验和本地开发适配
  services/      浏览器端代理请求
  stores/        登录状态和对话状态
  types/         对话类型与保留上限
  utils/         浏览器历史记录读写
  __tests__/     工具调用、持久化与密钥边界测试
  views/         登录和对话页面
  components/    布局与菜单
  assets/        全局样式
api/             Vercel 必需的登录和对话入口（实现均在 src 中）
.env.local       本地配置及 Vercel 导入源（不提交）
```

## 历史记录

对话保存在同一浏览器、同一站点的 localStorage 中。刷新、关闭浏览器、退出并重新登录后均会恢复。仅保留最近 **10 条消息（用户与 AI 消息合计）**，每次写入和恢复时都会截断；请求模型时也只发送这 10 条上下文。工具内部调用记录和错误提示不保存到对话中。

清除站点数据、使用无痕模式或切换站点域名不会共享原有记录。存储损坏会安全忽略，存储不可用时页面会显示保存失败信息。

## 验证

```powershell
npm test
npm run build
```

测试覆盖历史恢复与保留上限、损坏数据、代理输入校验、LangChain 工具循环，以及服务端模块和密钥进入浏览器构建时的拦截。部署回归测试将函数及依赖编译为纯 JavaScript，并在关闭 TypeScript 支持的 Node 进程中验证登录及聊天接口鉴权，避免只在本地源码运行时通过。测试通过本地模拟 OpenAI 响应验证，不需要真实 Key，也不会产生模型费用。构建同时执行前端、代理和服务端的 TypeScript 类型检查。
