<script setup>
// Side: login i op til to trin, adgangskode og derefter kode fra appen, hvis brugeren har to-faktor.
import { nextTick, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Eye, EyeOff } from '@lucide/vue';
import { useAuth } from '../composables/useAuth.js';
import AppButton from '../components/atoms/AppButton.vue';
import TextField from '../components/molecules/TextField.vue';
import AuthLayout from '../components/templates/AuthLayout.vue';

const auth = useAuth();
const router = useRouter();

const step = ref('password');
const email = ref('');
const password = ref('');
const showPassword = ref(false);
const code = ref('');
const useRecoveryCode = ref(false);
const error = ref('');
const busy = ref(false);
const codeField = ref(null);

async function submitPassword() {
  error.value = '';
  busy.value = true;
  try {
    const needsCode = await auth.login(email.value, password.value);
    password.value = '';
    if (!needsCode) return router.replace(auth.homeRoute.value);
    step.value = 'code';
    await nextTick();
    codeField.value?.focus();
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
  <AuthLayout v-if="step === 'password'">
    <template #title>Log<br />ind.</template>

    <form class="form" novalidate @submit.prevent="submitPassword">
      <TextField
        id="email"
        v-model="email"
        label="E-mail"
        type="email"
        autocomplete="username"
        inputmode="email"
      />
      <TextField
        id="password"
        v-model="password"
        label="Adgangskode"
        :type="showPassword ? 'text' : 'password'"
        autocomplete="current-password"
      >
        <template #trailing>
          <button
            type="button"
            class="icon-button"
            :aria-label="showPassword ? 'Skjul adgangskode' : 'Vis adgangskode'"
            :aria-pressed="showPassword"
            @click="showPassword = !showPassword"
          >
            <EyeOff v-if="showPassword" :size="22" aria-hidden="true" />
            <Eye v-else :size="22" aria-hidden="true" />
          </button>
        </template>
      </TextField>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <AppButton type="submit" size="large" :disabled="busy || !email || !password">
        {{ busy ? 'Logger ind …' : 'Log ind' }}
      </AppButton>
    </form>
  </AuthLayout>

  <AuthLayout v-else>
    <template #title>Kode.</template>

    <form class="form" novalidate @submit.prevent="submitCode">
      <p class="muted lead">
        {{ useRecoveryCode
          ? 'Skriv en af de gendannelseskoder, du gemte, da du slog to-faktor til.'
          : 'Åbn din authenticator-app, og skriv den 6-cifrede kode for Pudseren.' }}
      </p>

      <TextField
        id="code"
        v-model="code"
        ref="codeField"
        :label="useRecoveryCode ? 'Gendannelseskode' : 'Kode'"
        :inputmode="useRecoveryCode ? 'text' : 'numeric'"
        :autocomplete="useRecoveryCode ? 'off' : 'one-time-code'"
        :maxlength="useRecoveryCode ? 20 : 6"
      />

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <AppButton type="submit" size="large" :disabled="busy || !code">
        {{ busy ? 'Tjekker …' : 'Fortsæt' }}
      </AppButton>

      <button class="link" type="button" @click="toggleRecovery">
        {{ useRecoveryCode ? 'Brug koden fra appen' : 'Har du mistet telefonen? Brug en gendannelseskode' }}
      </button>

      <p class="muted small">
        Koden skifter hvert 30. sekund. Du har 5 minutter, før du skal skrive adgangskoden igen.
      </p>
    </form>
  </AuthLayout>
</template>

<style scoped>
.form {
  display: grid;
  gap: 24px;
}

.lead {
  margin: 0;
}

.icon-button {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-right: 6px;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--ink-2);
  cursor: pointer;
}

.icon-button:hover {
  background: var(--soft);
}

.link {
  justify-self: start;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--accent);
  cursor: pointer;
}

.small {
  margin: 0;
  font-size: 0.8125rem;
}
</style>
