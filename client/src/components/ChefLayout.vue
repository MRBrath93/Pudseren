<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth.js';
import { BookUser, ClipboardList, LogOut, Route, Users } from '@lucide/vue';
import AppLogo from './AppLogo.vue';

const auth = useAuth();
const router = useRouter();

const links = [
  { to: '/skal-pudses', label: 'Skal pudses', icon: ClipboardList },
  { to: '/ruter', label: 'Ruter', icon: Route },
  { to: '/kunder', label: 'Kunder', icon: BookUser },
  { to: '/hold', label: 'Hold', icon: Users },
];

// Forbogstaver til den runde knap nederst, fx "Henrik Sørensen" -> "HS".
const initials = computed(() => {
  let result = '';
  for (const part of (auth.user.value?.name ?? '').split(' ')) {
    if (part) result += part[0].toUpperCase();
    if (result.length === 2) break;
  }
  return result;
});

async function logout() {
  await auth.logout();
  router.replace('/login');
}
</script>

<template>
  <div class="layout">
    <nav class="rail" aria-label="Hovedmenu">
      <RouterLink to="/skal-pudses" class="logo"><AppLogo :height="20" /></RouterLink>
      <RouterLink v-for="link in links" :key="link.to" :to="link.to" class="item">
        <span class="pill"><component :is="link.icon" :size="22" aria-hidden="true" /></span>
        <span class="label">{{ link.label }}</span>
      </RouterLink>
      <div class="account">
        <span class="avatar" :title="auth.user.value?.name">{{ initials }}</span>
        <button class="item logout" type="button" @click="logout">
          <span class="pill"><LogOut :size="22" aria-hidden="true" /></span>
          <span class="label">Log ud</span>
        </button>
      </div>
    </nav>
    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 96px 1fr;
  min-height: 100dvh;
}

.rail {
  position: sticky;
  top: 0;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 0;
  border-right: 1px solid var(--line);
}

.logo {
  display: block;
  margin-bottom: 32px;
  color: var(--accent);
}

.item {
  display: grid;
  justify-items: center;
  gap: 4px;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: var(--ink-2);
  text-decoration: none;
  cursor: pointer;
}

.pill {
  display: grid;
  place-items: center;
  width: 56px;
  height: 32px;
  border-radius: 16px;
  transition: background-color 0.15s;
}

.label {
  font-size: 0.75rem;
  font-weight: 600;
}

.item:hover .pill {
  background: var(--soft);
}

.item.router-link-active {
  color: var(--ink);
}

.item.router-link-active .pill {
  background: var(--accent-container);
  color: var(--accent);
}

.account {
  margin-top: auto;
  display: grid;
  justify-items: center;
  gap: 16px;
  width: 100%;
}

.avatar {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--soft);
  font-size: 0.875rem;
  font-weight: 700;
}

/* På små skærme bliver rail'en til en bundmenu. */
@media (max-width: 700px) {
  .layout {
    grid-template-columns: 1fr;
    padding-bottom: 80px;
  }

  .rail {
    position: fixed;
    inset: auto 0 0;
    z-index: 10;
    height: auto;
    flex-direction: row;
    gap: 0;
    padding: 12px 0 calc(12px + env(safe-area-inset-bottom));
    border-right: 0;
    border-top: 1px solid var(--line);
    background: var(--bg);
  }

  .logo,
  .avatar {
    display: none;
  }

  .account {
    margin: 0;
    width: auto;
    flex: 1;
  }
}
</style>
