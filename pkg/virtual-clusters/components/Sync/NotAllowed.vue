<script>
export default { name: 'SyncNotAllowed' };
</script>

<template>
  <div>
    <h4>{{ t('k3k.policy.synchronization.notAllowed.title') }}</h4>
    <t
      class="text-deemphasized"
      raw
      k="k3k.policy.synchronization.notAllowed.description"
    />
  </div>
</template>
