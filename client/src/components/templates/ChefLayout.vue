<script setup>
// Skabelon: fælles layout for chefens sider. Menuen til venstre, siden til højre.
import NavigationRail from '../organisms/NavigationRail.vue';
</script>

<template>
  <div class="layout">
    <NavigationRail />
    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 96px 1fr;
  min-height: 100dvh;
}

.content {
  /* På store skærme holdes siden samlet i midten i stedet for at strække sig ud. */
  width: 100%;
  max-width: 1344px;
  margin: 0 auto;
}

/* På små skærme ligger menuen i bunden, så siden skal have plads under sig. */
@media (max-width: 700px) {
  .layout {
    grid-template-columns: 1fr;
    padding-bottom: 80px;
  }
}
</style>
