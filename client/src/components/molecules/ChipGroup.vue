<script setup>
// Molekyle: en række chips, hvor én kan være valgt ad gangen.
import AppChip from '../atoms/AppChip.vue';

defineProps({
  options: { type: Array, required: true },
  label: { type: String, required: true },
});

const model = defineModel({ type: String, required: true });
</script>

<template>
  <div class="chips" role="group" :aria-label="label">
    <AppChip v-for="option in options" :key="option" :selected="model === option" @click="model = option">
      {{ option }}
    </AppChip>
  </div>
</template>

<style scoped>
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
