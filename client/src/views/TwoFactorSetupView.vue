<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppHeader from '../components/AppHeader.vue';
import { api } from '../api.js';
import { useAuth } from '../composables/useAuth.js';

const auth = useAuth();
const router = useRouter();

// Trinene: henter QR-kode → skriv første kode → gem gendannelseskoder → færdig.
const step = ref('loading');
const qr = ref('');
const secret = ref('');
const code = ref('');
const recoveryCodes = ref([]);
const saved = ref(false);
const error = ref('');
const busy = ref(false);

// Hemmeligheden vises i grupper af 4, så den er lettere at skrive af, hvis QR-koden ikke kan scannes.
const secretGroups = computed(() => {
  const groups = [];
  for (let i = 0; i < secret.value.length; i += 4) groups.push(secret.value.slice(i, i + 4));
  return groups.join(' ');
});

onMounted(async () => {
  try {
    const data = await api.post('/auth/2fa/setup');
    qr.value = data.qr;
    secret.value = data.secret;
    step.value = 'scan';
  } catch (e) {
    // 409: to-faktor er allerede slået til.
    step.value = e.status === 409 ? 'already' : 'error';
    error.value = e.message;
  }
});

async function enable() {
  error.value = '';
  busy.value = true;
  try {
    const data = await api.post('/auth/2fa/enable', { code: code.value });
    recoveryCodes.value = data.recoveryCodes;
    // Hemmeligheden behøver ikke længere at ligge i browserens hukommelse.
    qr.value = '';
    secret.value = '';
    step.value = 'recovery';
  } catch (e) {
    error.value = e.message;
    code.value = '';
  } finally {
    busy.value = false;
  }
}

function downloadCodes() {
  const text = `Pudseren – gendannelseskoder for ${auth.user.value.email}\n` +
    'Hver kode kan bruges én gang, hvis du mister telefonen.\n\n' +
    recoveryCodes.value.join('\n') + '\n';
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  link.download = 'pudseren-gendannelseskoder.txt';
  link.click();
  URL.revokeObjectURL(link.href);
}

function finish() {
  auth.markTwoFactorEnabled();
  recoveryCodes.value = [];
  router.replace(auth.homeRoute.value);
}
</script>

<template>
  <AppHeader />
  <main class="page narrow">
    <h1>Slå to-faktor til</h1>

    <p v-if="step === 'loading'" class="muted">Henter …</p>

    <template v-else-if="step === 'scan'">
      <p class="muted">
        Som chef kan du se alle kunder og nøglekoder. Derfor skal du ud over adgangskoden
        også bruge en kode fra din telefon, når du logger ind.
      </p>

      <ol class="steps">
        <li>
          Installér en authenticator-app på din telefon, fx Microsoft Authenticator, Google Authenticator eller 1Password.
        </li>
        <li>
          Scan QR-koden med appen.
          <img :src="qr" alt="QR-kode til authenticator-appen" width="240" height="240" class="qr" />
          <details>
            <summary>Kan du ikke scanne? Skriv koden ind i stedet</summary>
            <code class="secret">{{ secretGroups }}</code>
          </details>
        </li>
        <li>
          <form class="field" novalidate @submit.prevent="enable">
            <label for="code">Skriv den 6-cifrede kode, appen viser</label>
            <div class="row">
              <input id="code" v-model="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required />
              <button class="btn btn-primary" type="submit" :disabled="busy || code.length !== 6">
                {{ busy ? 'Tjekker …' : 'Slå til' }}
              </button>
            </div>
            <p v-if="error" class="error" role="alert">{{ error }}</p>
          </form>
        </li>
      </ol>
    </template>

    <template v-else-if="step === 'recovery'">
      <p>To-faktor er slået til.</p>
      <div class="card">
        <h2>Gem dine gendannelseskoder</h2>
        <p class="muted">
          Mister du telefonen, kan du logge ind med en af disse koder. Hver kode kan bruges én gang.
          De vises kun nu – gem dem i din adgangskodemanager eller print dem.
        </p>
        <ul class="codes">
          <li v-for="recoveryCode in recoveryCodes" :key="recoveryCode"><code>{{ recoveryCode }}</code></li>
        </ul>
        <button class="btn" type="button" @click="downloadCodes">Download som tekstfil</button>
        <label class="check">
          <input v-model="saved" type="checkbox" />
          Jeg har gemt mine gendannelseskoder
        </label>
        <button class="btn btn-primary" type="button" :disabled="!saved" @click="finish">Fortsæt</button>
      </div>
    </template>

    <template v-else-if="step === 'already'">
      <p>To-faktor er allerede slået til for din konto.</p>
      <button class="btn btn-primary" type="button" @click="finish">Fortsæt</button>
    </template>

    <p v-else class="error" role="alert">{{ error }}</p>
  </main>
</template>

<style scoped>
.narrow {
  max-width: 640px;
}

.steps {
  display: grid;
  gap: 24px;
  padding-left: 20px;
}

.qr {
  display: block;
  margin: 12px 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #ffffff;
}

.secret {
  display: inline-block;
  margin-top: 8px;
  font-size: 1.1rem;
  letter-spacing: 0.05em;
  word-break: break-all;
}

.row {
  display: flex;
  gap: 8px;
}

.row input {
  width: 9ch;
  font-size: 1.25rem;
  letter-spacing: 0.15em;
  font-variant-numeric: tabular-nums;
}

.card {
  display: grid;
  gap: 16px;
}

.card h2 {
  margin: 0;
}

.codes {
  display: grid;
  grid-template-columns: repeat(2, max-content);
  gap: 8px 32px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 1.1rem;
}

.check {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
