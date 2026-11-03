<script setup lang="ts">
import { computed } from 'vue';
import { useReportInvalidToSection } from '@components/RcSection';

const props = defineProps<{
  message?: string;
}>();

// form inputs report their own errors to the enclosing RcSection
// this reports an error that is not tied to a single input, so the section and its parents show the error icon
useReportInvalidToSection(computed(() => !!props.message));
</script>

<template>
  <p
    v-if="message"
    class="text-error"
  >
    {{ message }}
  </p>
</template>
