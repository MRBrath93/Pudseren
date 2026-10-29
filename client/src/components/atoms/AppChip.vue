<script setup>
// Atom: valgbar chip (Chip i Figma). Viser et flueben, når den er valgt.
import { Check } from '@lucide/vue';

defineProps({
  selected: { type: Boolean, default: false },
});
</script>

<template>
  <button type="button" class="chip" :aria-pressed="selected">
    <Check v-if="selected" :size="16" aria-hidden="true" />
    <slot />
  </button>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--outline);
  border-radius: 8px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
}

.chip[aria-pressed='true'] {
  border-color: var(--accent-container);
  background: var(--accent-container);
  color: var(--accent);
}
</style>
