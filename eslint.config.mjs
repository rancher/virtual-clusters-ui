
import js from '@eslint/js';
import globals from 'globals';
import neostandard from 'neostandard';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import pluginCypress from 'eslint-plugin-cypress/flat';
import pluginImport from 'eslint-plugin-import';
import pluginNode from 'eslint-plugin-node';
import vueParser from 'vue-eslint-parser';
import localRules from 'eslint-plugin-local-rules';

// The `standard` import rules that `neostandard` no longer pulls in.
const standardImportRules = {
  'import/export':           'error',
  'import/first':            'error',
  'import/no-absolute-path': ['error', {
    esmodule: true, commonjs: true, amd: false
  }],
  'import/no-duplicates':            'error',
  'import/no-named-default':         'error',
  'import/no-webpack-loader-syntax': 'error',
};


// Vue `<script setup>` compiler macros
const compilerMacros = {
  defineProps:   'readonly',
  defineEmits:   'readonly',
  defineExpose:  'readonly',
  withDefaults:  'readonly',
  defineModel:   'readonly',
  defineOptions: 'readonly',
  defineSlots:   'readonly',
};


export default [
  // Match the legacy lint scope. The old dashboard scripts used `--ext .js,.ts,.vue`, and eslintrc
  // ignored dotfiles/dot-directories by default — flat config does neither, so replicate:
  //   - only lint .js/.ts/.vue (ignore .tsx/.jsx/.mjs/.cjs, incl. these config files),
  //   - ignore dotfiles & dot-directories (.github, .storybook, .vscode, ...).
  {
    ignores: [
      '**/coverage/',
      '**/.nyc_output/',
      '**/node_modules/',
      '**/.npm/',
      '**/.eslintcache',
      '**/.env',
      '**/.cache/',
      '**/.next/',
      '**/dist/',
      '**/dist-pkg/',
      '**/.DS_Store',
      'pkg/**/node_modules/',
      'cypress/dist/',
      'cypress/bin/',
      'cypress/template/',
    ],
  },

  // Flat config defaults `reportUnusedDisableDirectives` to "warn"; the legacy eslintrc
  // setup left it off. Keep it off to preserve the pre-migration behaviour.
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },

  // eslint:recommended
  js.configs.recommended,

  // standard + @vue/standard (flat successor). `noStyle: true` keeps neostandard's quality
  // rules but omits its `@stylistic/*` layer: those rules are TypeScript-aware and would
  // flag type-syntax (type-literal braces, `interface X{`, parens around `as` casts) that
  // the legacy eslint-config-standard *core* formatting rules never checked. Formatting is
  // instead provided below by the same core rules the legacy config used (JS-only) — an
  // exact behavioural match that keeps the codebase green without source changes.
  ...neostandard({
    ts: true, noStyle: true, noJsx: true
  }),

  // @typescript-eslint/recommended
  ...tseslint.configs.recommended,

  // vue/vue3-recommended (flat naming: `flat/recommended` === Vue 3 recommended)
  ...pluginVue.configs['flat/recommended'],

  // cypress/recommended
  pluginCypress.configs.recommended,

  {
    plugins: {
      import:        pluginImport,
      node:          pluginNode,
      'local-rules': localRules,
    },
    languageOptions: {
      parser:        vueParser,
      ecmaVersion:   2020,
      sourceType:    'module',
      parserOptions: {
        parser:              tseslint.parser,
        extraFileExtensions: ['.vue'],
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...compilerMacros,
        NodeJS:                'readonly',
        Timer:                 'readonly',
        WebpackRequireContext: 'readonly',
      },
    },
  },

  // local-rules/all
  // custom eslint rules defined in ./eslint-plugin-local-rules
  {
    rules: {
      'local-rules/v-clean-tooltip': 'error',
      'local-rules/no-hr-element':   'error',
    },
  },


  {
    rules: {
      ...standardImportRules,
      'import/order':               'off',
      'import/no-named-as-default': 'off',

      // --- ESLint v9 / typescript-eslint v8 upgrade compatibility ---
      // Disabled (config-only, no source changes) to preserve the pre-upgrade green state.
      '@typescript-eslint/no-require-imports':      'off',
      '@typescript-eslint/no-wrapper-object-types': 'off',
      '@typescript-eslint/no-unused-expressions':   'off',
      'no-unsafe-optional-chaining':                'off',
      'no-import-assign':                           'off',
      'no-constant-binary-expression':              'off',
      'n/no-deprecated-api':                        'off',
      'n/no-callback-literal':                      'off',
      'cypress/unsafe-to-chain-command':            'off',
      camelcase:                                    'off',
      // --- end upgrade compatibility block ---

      // --- ESLint 10 / eslint-plugin-vue 10 ruleset churn ---
      // Rules newly added to recommended by the eslint 9->10 + vue 9->10 bump. Disabled
      // (config-only, no source changes) to preserve the green state, same as the block above.
      'no-useless-assignment':             'off', // new in eslint 10 recommended
      'preserve-caught-error':             'off', // new in eslint 10 recommended
      'vue/no-required-prop-with-default': 'off', // new in eslint-plugin-vue 10 recommended
      'vue/require-default-prop':          'off', // re-fires under eslint-plugin-vue 10
      // --- end eslint 10 / vue 10 churn block ---

      // Core formatting rules — values captured verbatim from the pre-migration
      // (`eslint-config-standard` + legacy overrides) resolved config. Core rules are
      // JS-only, exactly matching the previous behaviour (see `noStyle` note above).
      'array-bracket-spacing':       ['warn', 'never'],
      'arrow-parens':                ['warn'],
      'arrow-spacing':               ['warn', { before: true, after: true }],
      'block-spacing':               ['warn', 'always'],
      'brace-style':                 ['warn', '1tbs'],
      'comma-dangle':                ['warn', 'only-multiline'],
      'comma-spacing':               ['warn', { before: false, after: true }],
      'comma-style':                 ['error', 'last'],
      'computed-property-spacing':   ['error', 'never', { enforceForClassMembers: true }],
      'dot-location':                ['error', 'property'],
      'eol-last':                    ['error'],
      'func-call-spacing':           ['warn', 'never'],
      'keyword-spacing':             ['warn', { before: true, after: true }],
      'lines-between-class-members': ['warn', 'always', { exceptAfterSingleLine: true }],
      'multiline-ternary':           ['warn', 'never'],
      'new-parens':                  ['error'],
      'newline-per-chained-call':    ['warn', { ignoreChainWithDepth: 4 }],
      'no-extra-parens':             ['error', 'functions'],
      'no-floating-decimal':         ['error'],
      'no-mixed-operators':          ['error', {
        allowSamePrecedence: true,
        groups:              [['==', '!=', '===', '!==', '>', '>=', '<', '<='], ['&&', '||'], ['in', 'instanceof']],
      }],
      'no-mixed-spaces-and-tabs':      ['error'],
      'no-multi-spaces':               ['error'],
      'no-tabs':                       ['error'],
      'no-trailing-spaces':            ['warn'],
      'no-whitespace-before-property': ['warn'],
      'object-curly-newline':          ['warn', {
        ObjectExpression:  { multiline: true, minProperties: 3 },
        ObjectPattern:     { multiline: true, minProperties: 4 },
        ImportDeclaration: { multiline: true, minProperties: 5 },
        ExportDeclaration: { multiline: true, minProperties: 3 },
      }],
      'object-curly-spacing':    ['warn', 'always'],
      'object-property-newline': ['warn', { allowAllPropertiesOnSameLine: false, allowMultiplePropertiesPerLine: true }],
      'object-shorthand':        'warn',
      'operator-linebreak':      ['error', 'after', {
        overrides: {
          '?': 'before', ':': 'before', '|>': 'before'
        }
      }],
      'padded-blocks':                   ['warn', 'never'],
      'padding-line-between-statements': ['warn',
        {
          blankLine: 'always', prev: '*', next: 'return'
        },
        {
          blankLine: 'always', prev: 'function', next: 'function'
        },
        {
          blankLine: 'always', prev: ['const', 'let', 'var'], next: '*'
        },
        {
          blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var']
        },
      ],
      'quote-props':                 ['warn', 'as-needed'],
      quotes:                        ['warn', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
      'rest-spread-spacing':         ['warn', 'never'],
      'space-before-blocks':         ['error', 'always'],
      'space-before-function-paren': ['warn', 'never'],
      'space-infix-ops':             ['warn'],
      'space-unary-ops':             ['warn', { words: true, nonwords: false }],
      'spaced-comment':              ['warn', 'always', {
        line:  { markers: ['*package', '!', '/', ',', '='] },
        block: {
          balanced: true, markers: ['*package', '!', ',', ':', '::', 'flow-include'], exceptions: ['*']
        },
      }],
      'switch-colon-spacing':   ['warn'],
      'template-curly-spacing': ['warn', 'always'],
      'template-tag-spacing':   ['error', 'never'],
      'yield-star-spacing':     ['warn', 'both'],

      indent:        ['warn', 2],
      'key-spacing': ['warn', {
        align: {
          beforeColon: false, afterColon: true, on: 'value', mode: 'strict'
        },
        multiLine: { beforeColon: false, afterColon: true },
      }],
      semi:                                         ['warn', 'always'],
      // --- end restored formatting rules ---
      // --- rule overrides from rancher/dashboard eslint.config.mjs ---
      'vue/one-component-per-file':                 'off',
      'vue/no-deprecated-slot-attribute':           'off',
      'vue/require-explicit-emits':                 'error',
      'vue/v-on-event-hyphenation':                 'off',
      'dot-notation':                               'off',
      'generator-star-spacing':                     'off',
      'guard-for-in':                               'off',
      'linebreak-style':                            'off',
      'new-cap':                                    'off',
      'no-empty':                                   'off',
      'no-extra-boolean-cast':                      'off',
      'no-new':                                     'off',
      'no-plusplus':                                'off',
      'no-useless-escape':                          'off',
      strict:                                       'off',
      'vue/no-unused-components':                   'warn',
      curly:                                        'warn',
      eqeqeq:                                       'warn',
      'implicit-arrow-linebreak':                   'warn',
      'no-caller':                                  'warn',
      'no-cond-assign':                             ['warn', 'except-parens'],
      'no-console':                                 'warn',
      'no-debugger':                                'warn',
      'no-eq-null':                                 'warn',
      'no-eval':                                    'warn',
      'no-undef':                                   'warn',
      'no-unused-vars':                             'warn',
      'no-redeclare':                               'off',
      '@typescript-eslint/no-redeclare':            ['error'],
      'prefer-arrow-callback':                      'warn',
      'prefer-template':                            'warn',
      'vue/order-in-components':                    'off',
      'vue/no-lone-template':                       'off',
      'vue/v-slot-style':                           'off',
      'vue/component-tags-order':                   'off',
      'vue/no-mutating-props':                      'off',
      '@typescript-eslint/no-unused-vars':          'off',
      'array-callback-return':                      'off',
      'vue/multi-word-component-names':             'off',
      'vue/no-reserved-component-names':            'off',
      'vue/no-useless-template-attributes':         'off',
      'vue/attribute-hyphenation':                  'off',
      'vue/valid-next-tick':                        'off',
      'vue/no-computed-properties-in-data':         'off',
      'vue/no-side-effects-in-computed-properties': 'off',
    },
  },

  // override: *.js
  {
    files: ['**/*.js'],
    rules: {
      'prefer-regex-literals':                'off',
      'vue/component-definition-name-casing': 'off',
      'no-unreachable-loop':                  'off',
      'computed-property-spacing':            'off',
    },
  },


  // override: **/*.vue
  {
    files: ['**/*.vue'],
    rules: {
      'vue/no-v-html':                    'error',
      'vue/html-indent':                  ['error', 2],
      'vue/html-closing-bracket-newline': ['error', { singleline: 'never', multiline: 'always' }],
      'vue/html-closing-bracket-spacing': 2,
      'vue/html-end-tags':                2,
      'vue/html-quotes':                  2,
      'vue/html-self-closing':            ['error', {
        html: {
          void: 'never', normal: 'always', component: 'always'
        },
        svg:  'always',
        math: 'always',
      }],
      'vue/max-attributes-per-line': ['error', {
        singleline: { max: 1 },
        multiline:  { max: 1 },
      }],
    },
  },

  // override: **/*.{js,ts,vue}
  {
    files: ['**/*.{js,ts,vue}'],
    rules: {
      '@typescript-eslint/no-this-alias':   'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // override: po
  {
    files: ['**/po/**/*.{js,ts,vue}'],
    rules: { '@typescript-eslint/explicit-module-boundary-types': 'off' },
  },
];
