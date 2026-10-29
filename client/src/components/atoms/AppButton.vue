<script setup>
import { computed } from 'vue';

// Atom: knap i tre typer (Knap i Figma). Bruger klasserne fra base.css.
const props = defineProps({
  variant: { type: String, default: 'filled' }, // filled | outlined | text
  size: { type: String, default: 'medium' }, // medium | large
  type: { type: String, default: 'button' },
});

const classes = computed(() => {
  const result = ['btn'];
  // Det mest almindelige først: den fyldte knap til den primære handling.
  if (props.variant === 'filled') result.push('btn-primary');
  else if (props.variant === 'text') result.push('btn-text');
  if (props.size === 'large') result.push('btn-large');
  return result;
});
</script>

<template>
  <button :type="type" :class="classes">
    <slot name="icon" />
    <slot />
  </button>
</template>
