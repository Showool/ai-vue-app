<script setup lang="ts">
import { ref } from 'vue'
import { ElButton, ElIcon, ElMenu, ElMenuItem, ElSubMenu, ElTooltip } from 'element-plus'
import {
  ArrowRight,
  ChatDotRound,
  Fold,
  MagicStick,
  SwitchButton,
  Expand,
} from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'
import AiChatView from '../views/AiChatView.vue'
import GitHubLink from './GitHubLink.vue'
import { ApiError } from '../services/api'

const auth = useAuthStore()
const collapsed = ref(window.matchMedia('(max-width: 760px)').matches)
const loggingOut = ref(false)
const logoutError = ref('')

async function logout() {
  if (loggingOut.value) return
  loggingOut.value = true
  logoutError.value = ''
  try {
    await auth.logout()
  } catch (cause) {
    logoutError.value = cause instanceof ApiError ? cause.message : '退出失败，请检查网络后重试'
  } finally {
    loggingOut.value = false
  }
}
</script>

<template>
  <div class="workspace" :class="{ 'is-collapsed': collapsed }">
    <aside class="sidebar" aria-label="主导航">
      <div class="sidebar-brand brand">
        <span class="brand-mark"
          ><el-icon><MagicStick /></el-icon></span
        ><span v-if="!collapsed">AI Workspace</span>
      </div>
      <div class="sidebar-navigation">
        <span v-if="!collapsed" class="navigation-label">工作空间</span>
        <el-menu
          default-active="ai-chat"
          :default-openeds="['ai']"
          :collapse="collapsed"
          :collapse-transition="false"
        >
          <el-sub-menu index="ai">
            <template #title
              ><el-icon><MagicStick /></el-icon><span>AI</span></template
            >
            <el-menu-item index="ai-chat"
              ><el-icon><ChatDotRound /></el-icon><span>AI 对话</span></el-menu-item
            >
          </el-sub-menu>
        </el-menu>
      </div>
      <div class="sidebar-bottom">
        <div class="sidebar-account">
          <span class="account-avatar">{{ auth.username?.[0]?.toUpperCase() }}</span>
          <div v-if="!collapsed" class="account-details">
            <strong>{{ auth.username }}</strong
            ><span>管理员</span>
          </div>
          <el-tooltip content="退出登录" placement="right">
            <el-button
              class="logout-button"
              text
              circle
              aria-label="退出登录"
              :loading="loggingOut"
              @click="logout"
              ><el-icon><SwitchButton /></el-icon
            ></el-button>
          </el-tooltip>
        </div>
        <p v-if="logoutError" class="logout-error" role="alert">{{ logoutError }}</p>
      </div>
    </aside>
    <div class="workspace-main">
      <header class="workspace-header">
        <div class="header-location">
          <el-tooltip :content="collapsed ? '展开菜单' : '收起菜单'" placement="bottom">
            <el-button
              text
              circle
              :aria-label="collapsed ? '展开菜单' : '收起菜单'"
              :aria-expanded="!collapsed"
              @click="collapsed = !collapsed"
              ><el-icon :size="20"><Expand v-if="collapsed" /><Fold v-else /></el-icon
            ></el-button>
          </el-tooltip>
          <span class="header-divider"></span><span class="breadcrumb-parent">AI</span
          ><el-icon class="breadcrumb-arrow"><ArrowRight /></el-icon><span>AI 对话</span>
        </div>
        <GitHubLink />
      </header>
      <AiChatView />
    </div>
  </div>
</template>
