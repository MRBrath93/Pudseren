<script setup>
// Molekyle: én kunde i en liste med afkrydsning (Listepunkt i Figma).
defineProps({
  customer: { type: Object, required: true },
  checked: { type: Boolean, default: false },
  when: { type: String, required: true },
  urgent: { type: Boolean, default: false },
});

defineEmits(['toggle']);
</script>

<template>
  <li>
    <label class="row">
      <input type="checkbox" :checked="checked" @change="$emit('toggle')" />
      <span class="who">
        <strong>{{ customer.name }}</strong>
        <span class="muted">{{ customer.address }}, {{ customer.city }}</span>
      </span>
      <span class="when" :class="{ urgent }">{{ when }}</span>
    </label>
  </li>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 16px;
  padding: 14px 12px;
  border-bottom: 1px solid var(--line);
  cursor: pointer;
}

.row:hover {
  background: var(--soft);
}

.row input {
  width: 20px;
  height: 20px;
  accent-color: var(--accent);
}

.who {
  display: grid;
  min-width: 0;
}

.who .muted {
  font-size: 0.875rem;
}

.when {
  font-size: 0.875rem;
  color: var(--ink-2);
  white-space: nowrap;
}

.when.urgent {
  color: var(--ink);
  font-weight: 700;
}
</style>
