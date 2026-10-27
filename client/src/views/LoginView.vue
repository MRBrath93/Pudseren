<script setup>
import { nextTick, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth.js';

const auth = useAuth();
const router = useRouter();

// Login sker i op til to trin: adgangskode, og derefter kode fra appen, hvis brugeren har to-faktor.
const step = ref('password');
const email = ref('');
const password = ref('');
const code = ref('');
const useRecoveryCode = ref(false);
const error = ref('');
const busy = ref(false);
const codeInput = ref(null);

async function submitPassword() {
  error.value = '';
  busy.value = true;
  try {
    const needsCode = await auth.login(email.value, password.value);
    password.value = '';
    if (!needsCode) return router.replace(auth.homeRoute.value);
    step.value = 'code';
    await nextTick();
    codeInput.value?.focus();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function submitCode() {
  error.value = '';
  busy.value = true;
  try {
    const payload = useRecoveryCode.value ? { recoveryCode: code.value } : { code: code.value };
    await auth.verifyTwoFactor(payload);
    router.replace(auth.homeRoute.value);
  } catch (e) {
    // Er de 5 minutter gået, skal adgangskoden skrives igen.
    if (e.status === 401) step.value = 'password';
    error.value = e.message;
    code.value = '';
  } finally {
    busy.value = false;
  }
}

function toggleRecovery() {
  useRecoveryCode.value = !useRecoveryCode.value;
  code.value = '';
  error.value = '';
}
</script>

<template>
  <main class="login">
    <form v-if="step === 'password'" class="card" novalidate @submit.prevent="submitPassword">
      <h1>Log ind</h1>

      <div class="field">
        <label for="email">E-mail</label>
        <input id="email" v-model="email" type="email" autocomplete="username" inputmode="email" required />
      </div>

      <div class="field">
        <label for="password">Adgangskode</label>
        <input id="password" v-model="password" type="password" autocomplete="current-password" required />
      </div>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <button class="btn btn-primary" type="submit" :disabled="busy || !email || !password">
        {{ busy ? 'Logger ind …' : 'Log ind' }}
      </button>
    </form>

    <form v-else class="card" novalidate @submit.prevent="submitCode">
      <h1>{{ useRecoveryCode ? 'Gendannelseskode' : 'Kode fra appen' }}</h1>
      <p class="muted">
        {{ useRecoveryCode
          ? 'Skriv en af de gendannelseskoder, du gemte, da du slog to-faktor til.'
          : 'Åbn din authenticator-app, og skriv den 6-cifrede kode for Pudseren.' }}
      </p>

      <div class="field">
        <label for="code">{{ useRecoveryCode ? 'Gendannelseskode' : 'Kode' }}</label>
        <input
          id="code"
          ref="codeInput"
          v-model="code"
          :inputmode="useRecoveryCode ? 'text' : 'numeric'"
          :autocomplete="useRecoveryCode ? 'off' : 'one-time-code'"
          :maxlength="useRecoveryCode ? 20 : 6"
          required
        />
      </div>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <button class="btn btn-primary" type="submit" :disabled="busy || !code">
        {{ busy ? 'Tjekker …' : 'Fortsæt' }}
      </button>
      <button class="link" type="button" @click="toggleRecovery">
        {{ useRecoveryCode ? 'Brug koden fra appen' : 'Har du mistet telefonen? Brug en gendannelseskode' }}
      </button>
    </form>
  </main>
</template>

<style scoped>
.login {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px;
}

.card {
  width: min(400px, 100%);
  display: grid;
  gap: 20px;
}

.link {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: var(--accent);
  text-decoration: underline;
  cursor: pointer;
  justify-self: start;
}
</style>
