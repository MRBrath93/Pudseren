<script setup>
// Midlertidig side for menupunkter, der bygges i et senere trin.
defineProps({ title: { type: String, required: true } });
</script>

<template>
  <div class="page">
    <h1>{{ title }}.</h1>
    <p class="muted">Denne side bygges i et senere trin.</p>
  </div>
</template>
