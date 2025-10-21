<script>
export default {
  name: 'K3kProgressBar',

  props: {
    progress: {
      type:    Number,
      default: 0
    }
  },
};
</script>

<template>
  <div
    class="progress"
  >
    <div class="progress-bar">
      <div class="pb-background" />
      <div
        :style="{width: `${progress}%`}"
        class="pb-foreground"
      />
    </div>
  </div>
</template>

<style lang="scss">
.progress {
  display: flex;
  margin-top: 6px;

  .progress-bar {
    align-items: center;
    display: flex;
    position: relative;
    flex: 1;

    .pb-foreground, .pb-background {
      position: absolute;
      height: 6px;
      border-radius: 5px;
      background-color: var(--primary);
      transition: width 0.1s ease-in;
    }

    .pb-background {
      opacity: 0.5;
      width: 100%;
    }
  }
}
</style>
