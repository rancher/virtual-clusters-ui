const createConfig = require('@rancher/shell/vue.config');

const config = createConfig(__dirname, {
  excludes: [],
  // excludes: ['fleet', 'example']
});

config.css.loaderOptions.sass.additionalData += `@import "~@pkg/virtual-clusters/assets/styles/index.scss";`;

module.exports = config;
