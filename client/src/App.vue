<script setup>
import { onMounted, ref } from 'vue';

// Første forbindelse mellem Vue og Express: spørg serveren, om den og databasen kører.
const status = ref('Tjekker …');

onMounted(async () => {
  try {
    const response = await fetch('/api/health');
    const data = await response.json();
    status.value = data.database ? 'Serveren og databasen kører.' : 'Serveren kører, men databasen svarer ikke.';
  } catch {
    status.value = 'Kan ikke få forbindelse til serveren.';
  }
});
</script>

<template>
  <main class="page">
    <h1>Pudseren</h1>
    <p>{{ status }}</p>
  </main>
</template>

<style scoped>
.page {
  max-width: 640px;
  margin: 0 auto;
  padding: 48px 24px;
}
</style>
