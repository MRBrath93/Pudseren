<script setup>
// Molekyle: tekstfelt med label i kanten (Felt i Figma, Material "outlined").
// Slot "trailing" bruges til en knap inde i feltet, fx "vis adgangskode".
import { ref } from 'vue';

defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  type: { type: String, default: 'text' },
  autocomplete: { type: String, default: 'off' },
  inputmode: { type: String, default: undefined },
  maxlength: { type: Number, default: undefined },
});

const model = defineModel({ type: String, default: '' });
const inputEl = ref(null);

// Siden kan sætte fokus i feltet, fx når kodetrinnet vises.
defineExpose({ focus: () => inputEl.value?.focus() });
</script>

<template>
  <div class="text-field">
    <label :for="id">{{ label }}</label>
    <input
      :id="id"
      ref="inputEl"
      v-model="model"
      :type="type"
      :autocomplete="autocomplete"
      :inputmode="inputmode"
      :maxlength="maxlength"
      required
    />
    <slot name="trailing" />
  </div>
</template>

<style scoped>
.text-field {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 56px;
  border: 1px solid var(--outline);
  border-radius: 12px;
  background: var(--surface);
}

.text-field:focus-within {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}

/* Labelen ligger i kanten af feltet, som i Material Design. */
label {
  position: absolute;
  top: -9px;
  left: 12px;
  padding: 0 4px;
  background: var(--surface);
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--ink-2);
}

.text-field:focus-within label {
  color: var(--accent);
}

input {
  flex: 1;
  min-width: 0;
  padding: 16px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  font: inherit;
  color: var(--ink);
}

input:focus {
  outline: none;
}
</style>
