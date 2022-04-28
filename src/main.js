/**
 * Copyright (c) 2022 Garen Fang <fungaren@qq.com>
 * -------------- The file has been tested on Xpra server version v4.3.2 ---------------
 * -------------------- and may not work on previous version -------------------------
 */
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import zh_cn from './locales/zh_cn'
import en_us from './locales/en_us'
import '@mdi/font/css/materialdesignicons.css'
// Do not import the default style as we will override it.
// import 'vue-draggable-resizable/dist/VueDraggableResizable.css'

import App from './App.vue'

const language = (navigator.languages && navigator.languages[0]) || navigator.language
const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: language.toLowerCase().replaceAll('-', '_'),
  fallbackLocale: 'en_us',
  messages: {
    zh_cn,
    en_us,
  }
})
const vue = createApp(App)
vue.config.productionTip = false
vue.use(i18n).mount('#app')
window.document.title = i18n.global.t('title')
