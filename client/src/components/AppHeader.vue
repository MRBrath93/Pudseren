<script setup>
import { useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth.js';

const auth = useAuth();
const router = useRouter();

async function logout() {
  await auth.logout();
  router.replace('/login');
}
</script>

<template>
  <header class="header">
    <strong>Pudseren</strong>
    <span class="muted">{{ auth.user.value?.name }}</span>
    <button class="btn" type="button" @click="logout">Log ud</button>
  </header>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 24px;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
}

.header strong {
  flex: 1;
}
</style>
