import { computed, ref } from 'vue';
import { api } from '../api.js';

// Hvem der er logget ind. Variablerne ligger uden for funktionen, så alle komponenter,
// der kalder useAuth(), deler de samme data. Det er det, vi ellers ville bruge Pinia til.
const user = ref(null);
const loaded = ref(false);

const isChef = computed(() => user.value?.role === 'chef');

// Chefen skal have to-faktor slået til, før han kan se kunderne.
const needsTwoFactorSetup = computed(() => isChef.value && !user.value.twoFactor);

const homeRoute = computed(() => {
  if (!user.value) return '/login';
  if (needsTwoFactorSetup.value) return '/to-faktor';
  return isChef.value ? '/skal-pudses' : '/dagens-rute';
});

async function fetchMe() {
  try {
    const data = await api.get('/auth/me');
    user.value = data.user;
  } catch {
    user.value = null;
  } finally {
    loaded.value = true;
  }
}

// Første trin. Returnerer true, hvis der også skal en kode til.
async function login(email, password) {
  const data = await api.post('/auth/login', { email, password });
  if (data.twoFactorRequired) return true;
  user.value = data.user;
  return false;
}

// Andet trin: { code } eller { recoveryCode }.
async function verifyTwoFactor(payload) {
  const data = await api.post('/auth/2fa/verify', payload);
  user.value = data.user;
  return data;
}

async function logout() {
  await api.post('/auth/logout');
  user.value = null;
}

function markTwoFactorEnabled() {
  user.value = { ...user.value, twoFactor: true };
}

export function useAuth() {
  return { user, loaded, isChef, needsTwoFactorSetup, homeRoute, fetchMe, login, verifyTwoFactor, logout, markTwoFactorEnabled };
}
