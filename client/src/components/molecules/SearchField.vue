<script setup>
// Molekyle: søgefelt med ikon og skjult label til skærmlæsere.
import { Search } from '@lucide/vue';

defineProps({
  label: { type: String, required: true },
});

const model = defineModel({ type: String, default: '' });
</script>

<template>
  <label class="search">
    <Search :size="20" aria-hidden="true" />
    <span class="visually-hidden">{{ label }}</span>
    <input v-model="model" type="search" :placeholder="label" />
  </label>
</template>

<style scoped>
.search {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 0 20px;
  border-radius: 999px;
  background: var(--soft);
  color: var(--ink-2);
}

.search input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  font: inherit;
  color: var(--ink);
}

.search input:focus {
  outline: none;
}

.search:focus-within {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}
</style>
