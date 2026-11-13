
<script setup>
import { ref } from 'vue'

const count = ref(0)
</script>

<template>
  <main class="container">
    <h1>My First Vue 3 App</h1>
    <p>我的第一个 Vue 3 + Vercel 网站</p>

    <button @click="count++">
      点击次数：{{ count }}
    </button>
  </main>
</template>

<style scoped>
.container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  font-family: Arial, sans-serif;
}

h1 {
  color: #42b883;
}

button {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  background: #42b883;
  color: white;
  cursor: pointer;
}
</style>
