<script setup>
// Skabelon: login og to-faktor. Stor overskrift til venstre, formular til højre.
import AppLogo from '../atoms/AppLogo.vue';
</script>

<template>
  <div class="auth">
    <header class="logo">
      <AppLogo :height="28" />
    </header>
    <h1 class="title"><slot name="title" /></h1>
    <main class="content">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.auth {
  /* På store skærme holdes indholdet samlet i midten. */
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  min-height: 100dvh;
  display: grid;
  grid-template-columns: 1fr minmax(0, 440px);
  grid-template-rows: auto 1fr;
  column-gap: 64px;
  padding: 48px 80px;
}

.logo {
  grid-column: 1 / -1;
  color: var(--accent);
}

.title {
  align-self: center;
  margin: 0;
  font-size: clamp(5rem, 14vw, 13rem);
  font-weight: 800;
  line-height: 0.88;
  letter-spacing: -0.06em;
}

.content {
  align-self: center;
}

/* På telefonen står overskrift og formular under hinanden. */
@media (max-width: 800px) {
  .auth {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto 1fr;
    row-gap: 32px;
    padding: 24px 20px;
  }

  .title {
    font-size: clamp(4rem, 22vw, 7rem);
  }

  .content {
    align-self: start;
  }
}
</style>
