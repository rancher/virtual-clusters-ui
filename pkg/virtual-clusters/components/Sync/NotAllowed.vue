<script>
import { MODES } from '../../utils/shared';

export const NOT_ALLOWED_SECTIONS = {
  SYNCHRONIZATION:  'synchronization',
  AGENTS:           'agents',
  SECURITY:         'security',
  ISOLATION:        'isolation',
  AGENT_SCHEDULING: 'agentScheduling'
};

export default {
  name:  'SyncNotAllowed',
  props: {
    mode: {
      type:    String,
      default: MODES.VIRTUAL
    },

    /** Which part of the config is unavailable - see NOT_ALLOWED_SECTIONS */
    section: {
      type:      String,
      default:   NOT_ALLOWED_SECTIONS.SYNCHRONIZATION,
      validator: (value) => Object.values(NOT_ALLOWED_SECTIONS).includes(value)
    }
  }
};
</script>

<template>
  <div>
    <h4>{{ t('k3k.policy.notAllowed.title', {mode: t(`k3k.mode.${mode}.label`)}) }}</h4>
    <t
      class="text-deemphasized"
      raw
      :k="`k3k.policy.notAllowed.${section}.${mode}`"
    />
  </div>
</template>
