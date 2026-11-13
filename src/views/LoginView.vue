<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElButton, ElForm, ElFormItem, ElIcon, ElInput } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { ArrowRight, ChatDotRound, Lock, MagicStick, User } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'
import GitHubLink from '../components/GitHubLink.vue'
import { ApiError } from '../services/api'

const auth = useAuthStore()
const formRef = ref<FormInstance>()
const form = reactive({ username: '', password: '' })
const error = ref('')
const submitting = ref(false)
const rules: FormRules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function login() {
  if (submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    const valid = await formRef.value?.validate().catch(() => false)
    if (valid && !(await auth.login(form.username, form.password))) {
      error.value = '账号或密码错误，请重新输入'
    }
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '登录失败，请检查网络后重试'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-story" aria-label="AI Workspace 简介">
      <div class="brand brand-light">
        <span class="brand-mark"
          ><el-icon><MagicStick /></el-icon
        ></span>
        <span>AI Workspace</span>
      </div>
      <div class="story-content">
        <span class="eyebrow"><span class="tiny-star">✦</span> YOUR EVERYDAY AI PARTNER</span>
        <h1>每一个好想法，<br />都从一次对话开始<span>。</span></h1>
        <p>让灵感自由流动，让思考更进一步。<br />你的专属 AI 工作空间，随时准备与你一起探索。</p>
        <div class="story-visual" aria-hidden="true">
          <div class="orbit orbit-one"></div>
          <div class="orbit orbit-two"></div>
          <div class="visual-spark">✦</div>
          <div class="floating-note note-question"><span>一个新的想法…</span><span>✧</span></div>
          <div class="floating-note note-answer">
            <span class="note-icon"
              ><el-icon><ChatDotRound /></el-icon
            ></span>
            <div><span class="note-line long"></span><span class="note-line short"></span></div>
            <span class="note-dots">···</span>
          </div>
        </div>
      </div>
      <div class="story-footer"><span class="status-dot"></span> 灵感在线，随时开启</div>
    </section>
    <section class="login-panel">
      <GitHubLink class="login-github-link" />
      <div class="mobile-brand brand">
        <span class="brand-mark"
          ><el-icon><MagicStick /></el-icon></span
        ><span>AI Workspace</span>
      </div>
      <div class="login-form-wrap">
        <span class="eyebrow form-eyebrow">WELCOME BACK</span>
        <h2>欢迎回来</h2>
        <el-form ref="formRef" :model="form" :rules="rules" size="large" @submit.prevent="login">
          <el-form-item prop="username">
            <el-input
              v-model="form.username"
              aria-label="账号"
              placeholder="请输入账号"
              :prefix-icon="User"
              autocomplete="username"
              @input="error = ''"
            />
          </el-form-item>
          <el-form-item prop="password">
            <el-input
              v-model="form.password"
              aria-label="密码"
              type="password"
              placeholder="请输入密码"
              :prefix-icon="Lock"
              show-password
              autocomplete="current-password"
              @input="error = ''"
            />
          </el-form-item>
          <p v-if="error" class="login-error" role="alert">{{ error }}</p>
          <el-button class="login-submit" type="primary" native-type="submit" :loading="submitting">
            <span>登 录</span><el-icon><ArrowRight /></el-icon>
          </el-button>
        </el-form>
        <p class="login-access-note">
          <el-icon><Lock /></el-icon> 仅限管理员账号访问
        </p>
      </div>
      <footer class="login-footer">AI Workspace <span>·</span> 为每一个想法，留一处空间</footer>
    </section>
  </main>
</template>
