<script setup>
// Side: Skal pudses. Henter data og sætter organismer og molekyler sammen.
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Route } from '@lucide/vue';
import { api } from '../api.js';
import { daysLeftInWeek, todayText } from '../lib/dates.js';
import AppButton from '../components/atoms/AppButton.vue';
import ChipGroup from '../components/molecules/ChipGroup.vue';
import SearchField from '../components/molecules/SearchField.vue';
import DueGroup from '../components/organisms/DueGroup.vue';

const router = useRouter();

const customers = ref([]);
const loading = ref(true);
const error = ref('');
const search = ref('');
const area = ref('Alle');
const selected = ref(new Set());

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const data = await api.get('/customers/due?days=14');
    customers.value = data.customers;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

// Områderne findes ud fra kundernes byer, så der ikke skal vedligeholdes en liste.
const areas = computed(() => {
  const cities = new Set();
  for (const customer of customers.value) cities.add(customer.city);
  return ['Alle', ...[...cities].sort((a, b) => a.localeCompare(b, 'da'))];
});

const visible = computed(() => {
  const query = search.value.trim().toLowerCase();
  const result = [];
  for (const customer of customers.value) {
    if (area.value !== 'Alle' && customer.city !== area.value) continue;
    if (query && !`${customer.name} ${customer.address}`.toLowerCase().includes(query)) continue;
    result.push(customer);
  }
  return result;
});

// Kunderne deles i tre grupper. days_overdue kommer fra databasen: positiv = over tid.
const groups = computed(() => {
  const weekEnd = daysLeftInWeek();
  const overdue = [];
  const thisWeek = [];
  const later = [];
  for (const customer of visible.value) {
    const daysUntil = -customer.days_overdue;
    if (daysUntil < 0) overdue.push(customer);
    else if (daysUntil <= weekEnd) thisWeek.push(customer);
    else later.push(customer);
  }
  const result = [];
  if (overdue.length) result.push({ title: 'Over tid', customers: overdue, urgent: true });
  if (thisWeek.length) result.push({ title: 'Denne uge', customers: thisWeek, urgent: false });
  if (later.length) result.push({ title: 'Senere', customers: later, urgent: false });
  return result;
});

const overdueCount = computed(() => {
  let count = 0;
  for (const customer of visible.value) {
    if (customer.days_overdue > 0) count += 1;
  }
  return count;
});

function toggle(id) {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected.value = next;
}

function makeRoute() {
  // Ruteplanlægningen bygges i sprint 2. Indtil da sendes de valgte kunder med i adressen.
  router.push({ path: '/ruter', query: { kunder: [...selected.value].join(',') } });
}

onMounted(load);
</script>

<template>
  <div class="due">
    <section class="summary">
      <p class="muted">{{ todayText() }}</p>
      <template v-if="!loading && !error">
        <p class="count" aria-hidden="true">{{ visible.length }}</p>
        <h1>
          <span class="visually-hidden">{{ visible.length }}</span>
          {{ visible.length === 1 ? 'kunde skal pudses' : 'kunder skal pudses' }}
        </h1>
        <p class="muted">
          {{ overdueCount }} er over tid, {{ visible.length - overdueCount }} skal pudses inden for 14 dage.
        </p>
        <ChipGroup v-model="area" :options="areas" label="Område" class="areas" />
      </template>
    </section>

    <section class="list" aria-labelledby="list-title">
      <h2 id="list-title" class="visually-hidden">Kunder, der skal pudses</h2>
      <SearchField v-model="search" label="Søg kunde eller adresse" />

      <p v-if="loading" class="muted status">Henter kunder …</p>
      <p v-else-if="error" class="error status" role="alert">{{ error }}</p>
      <p v-else-if="groups.length === 0" class="muted status">
        Ingen kunder skal pudses de næste 14 dage{{ search || area !== 'Alle' ? ' med det filter' : '' }}.
      </p>

      <DueGroup
        v-for="group in groups"
        :key="group.title"
        :title="group.title"
        :customers="group.customers"
        :urgent="group.urgent"
        :selected="selected"
        @toggle="toggle"
      />
    </section>

    <AppButton v-if="selected.size" size="large" class="fab" @click="makeRoute">
      <template #icon><Route :size="22" aria-hidden="true" /></template>
      Lav rute med {{ selected.size }}
    </AppButton>
  </div>
</template>

<style scoped>
.due {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(0, 1.2fr);
  gap: 48px;
  padding: 40px 48px 120px;
}

.summary {
  position: sticky;
  top: 40px;
  align-self: start;
}

.count {
  margin: 24px 0 0;
  font-size: clamp(6rem, 16vw, 14rem);
  font-weight: 800;
  line-height: 0.85;
  letter-spacing: -0.06em;
}

h1 {
  margin-top: 24px;
  font-size: clamp(1.75rem, 3vw, 2.5rem);
  font-weight: 500;
  letter-spacing: -0.02em;
}

.areas {
  margin-top: 24px;
}

.status {
  margin-top: 32px;
}

.fab {
  position: fixed;
  /* Knappen følger indholdets højre kant, også når siden er centreret på en stor skærm.
     96px er menuen, 1344px er indholdets maksimale bredde (se ChefLayout). */
  right: max(32px, calc((100vw - 96px - 1344px) / 2 + 32px));
  bottom: 32px;
  padding: 0 28px;
  border-radius: 16px;
  box-shadow: 0 6px 20px rgb(0 0 0 / 0.15);
}

@media (max-width: 900px) {
  .due {
    grid-template-columns: 1fr;
    gap: 24px;
    padding: 24px 20px 120px;
  }

  .summary {
    position: static;
  }

  .fab {
    right: 16px;
    bottom: 96px;
  }
}
</style>
