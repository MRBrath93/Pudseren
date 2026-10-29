<script setup>
// Organisme: en gruppe kunder med overskrift, fx "Over tid 3".
import CustomerListItem from '../molecules/CustomerListItem.vue';
import { dueText } from '../../lib/dates.js';

defineProps({
  title: { type: String, required: true },
  customers: { type: Array, required: true },
  selected: { type: Set, required: true },
  urgent: { type: Boolean, default: false },
});

defineEmits(['toggle']);
</script>

<template>
  <section class="group">
    <h3>{{ title }} <span class="muted">{{ customers.length }}</span></h3>
    <ul>
      <CustomerListItem
        v-for="customer in customers"
        :key="customer.id"
        :customer="customer"
        :checked="selected.has(customer.id)"
        :when="dueText(customer.days_overdue, customer.next_due)"
        :urgent="urgent"
        @toggle="$emit('toggle', customer.id)"
      />
    </ul>
  </section>
</template>

<style scoped>
h3 {
  margin: 32px 0 8px;
  padding: 0 12px;
  font-size: 0.875rem;
  font-weight: 600;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
</style>
