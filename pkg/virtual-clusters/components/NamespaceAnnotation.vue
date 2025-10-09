<script>
export default {
  name: 'K3KNamespaceAnnotationWarning',

  props: {
    // namspace to be created
    resource: {
      type:    Object,
      default: () => {
        return {};
      }
    }
  },

  computed: {
    shouldHavePolicy() {
      return this.resource?.metadata;
    }
  }
};
</script>

<template><div>resource : {{ {...resource} }}</div></template>
