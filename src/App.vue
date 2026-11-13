<script setup lang="ts">
import { ElConfigProvider, ElIcon } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import LoginView from './views/LoginView.vue'
import WorkspaceLayout from './components/WorkspaceLayout.vue'
import { useAuthStore } from './stores/auth'

const auth = useAuthStore()
</script>

<template>
  <el-config-provider :locale="zhCn">
    <WorkspaceLayout v-if="auth.isAuthenticated" />
    <LoginView v-else-if="auth.ready" />
    <div v-else class="session-loading" role="status">
      <el-icon class="is-loading" :size="24"><Loading /></el-icon
      ><span class="sr-only">正在恢复登录状态</span>
    </div>
  </el-config-provider>
</template>
