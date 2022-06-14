<template>
  <div>
    <div class="overlay" v-show="connecting">
      <div>
        <i class="mdi mdi-48px mdi-loading mdi-spin"></i>
        <p>{{ $t('connecting') }}</p>
      </div>
    </div>
    <div class="overlay" v-show="disconnected">
      <div>
        <i class="mdi mdi-48px mdi-cloud-off-outline"></i>
        <p>{{ $t('connection_lost') }}</p>
      </div>
    </div>
    <div class="overlay" v-show="launchingTimeout">
      <div>
        <i class="mdi mdi-48px mdi-loading mdi-spin"></i>
        <p>{{ $t('launching') }}</p>
      </div>
    </div>
    <div class="overlay" v-show="dialogAbout" @click="dialogAbout = false">
      <div>
        <i class="mdi mdi-48px mdi-information"></i>
        <p>{{ $t('about') }}</p>
        <p>{{ $t('title') }} - {{ VERSION }}</p>
        <p>
          <a href="https://github.com/fungaren/xpra-html5-vue" target="_blank">
            {{ $t('homepage') }}
          </a>
        </p>
        <p>Mozilla Public License Version 2.0</p>
      </div>
    </div>
    <p>
      <button style="margin-right:8px" @click="showKeyboard = !showKeyboard">
        {{ $t('toggle_keyboard') }}
      </button>
      <button style="margin-right:8px" @click="client.close()">
        {{ $t('disconnect') }}
      </button>
      <button style="margin-right:8px" @click="dialogAbout = true">
        {{ $t('about') }}
      </button>
    </p>
    <div class="desktop" ref="desktop" style="height:960px"
      @pointerup.self="pointerup"
      @pointerdown.self="pointerdown"
      @pointermove.self="pointermove">
      <vue-draggable-resizable v-for="(wnd, wndId) in windows" :key="wndId"
        v-show="!wnd.metadata.iconic" drag-handle=".wnd-title"
        :x="wnd.x" :y="wnd.y"
        :w="wnd.w" :h="wnd.h + (hasTitle(wnd) ? 32 : 0)"
        :z="(wnd.metadata.modal || wnd.metadata['override-redirect']) ? 6 :
          (wndId == focusedWndId ? 5 : null)"
        :min-width="minSize(wnd)[0]" :min-height="minSize(wnd)[1]"
        :max-width="maxSize(wnd)[0]" :max-height="maxSize(wnd)[1]"
        :draggable="draggable(wnd)"
        :resizable="resizable(wnd)"
        :active="true" :parent="true"
        :prevent-deactivation="true"
        :disable-user-select="false"
        :class="{fullscreen: wnd.metadata.fullscreen || wnd.metadata.maximized}"
        :onResizeStart="()=>{ mask = true }"
        @dragging="(x, y)=>move(wndId, x, y)"
        @resizing="(x, y, w, h)=>resize(wndId, x, y, w, h)">
        <XpraWnd :ref="'wnd_' + wndId" v-model:mask="mask"
          :wndId="Number(wndId)" :wnd="wnd" :decoration="hasTitle(wnd)"
          @ready="wndReady"
          @focusWnd="focusWnd"
          @pointerUp="pointerup"
          @pointerDown="pointerdown"
          @pointerMove="pointermove"
          @copy="client.pullClipboard($event)"
          @cut="client.pullClipboard($event)"
          @paste="client.pushClipboard($event)"
          @mouseWheel="wheel"
          @maximize="maximize"
          @restore="restore"
          @minimize="minimize"
          @close="close">
        </XpraWnd>
      </vue-draggable-resizable>
    </div>
    <SimpleKeyboard v-show="showKeyboard"
      @keyDown="forwardKey(true, $event)"
      @keyUp="forwardKey(false, $event)">
    </SimpleKeyboard>
    <p>{{ $t('window_list') }}</p>
    <ul>
      <li v-for="(wnd, wndId) in windows" :key="wndId">{{ wnd.metadata.title }}
        <button @click="showWindow(wndId)">
          {{ $t('show') }}
        </button>
      </li>
    </ul>
    <p>{{ $t('start_menu') }}</p>
    <ul>
      <TreeView v-for="(item, index) in treeData" :key="index" :item="item"
        @run="launchApp"></TreeView>
    </ul>
  </div>
</template>

<script>
/**
 * Copyright (c) 2022 Garen Fang <fungaren@qq.com>
 * -------------- The file has been tested on Xpra server version v4.3.2 ---------------
 * -------------------- and may not work on previous version -------------------------
 *
 * Copyright (c) 2013-2020 Antoine Martin <antoine@xpra.org>
 * Copyright (c) 2014 Joshua Higgins <josh@kxes.net>
 * Licensed under MPL 2.0
 */
import {XpraDecoderWorkerHost} from './decoder'
import global from './global'
const {XpraClient, platform, VERSION} = global

import TreeView from './components/TreeView.vue'
import SimpleKeyboard from './components/SimpleKeyboard.vue'
import XpraWnd from "./components/XpraWnd.vue"

// It does not support Vue 3 (at least currently), but we can use it in a compatible way.
import VueDraggableResizable from "vue-draggable-resizable/src/components/vue-draggable-resizable.vue"
import {nextTick} from 'vue'

const DECORATION_HEIGHT = 32
const CATEGORY_ICON = {
  'applications-office': 'mdi-file-document-edit',
  'applications-development': 'mdi-code-tags',
  'applications-utilities': 'mdi-application-array',
  'applications-accessories': 'mdi-tools',
  'applications-internet': 'mdi-earth',
  'applications-graphics': 'mdi-image',
  'applications-system': 'mdi-tune',
  'applications-multimedia': 'mdi-video',
  'applications-other': 'mdi-dots-horizontal',
}
export default {
  name: 'App',
  components: {
    XpraWnd,
    VueDraggableResizable,
    TreeView,
    SimpleKeyboard,
  },
  data() {
    return {
      client: null,
      decoder: null,
      connecting: true,
      disconnected: false,
      launchingTimeout: 0,
      showKeyboard: platform == 'ios' || platform == 'android',
      windows: {},
      drawingQueue: [],
      focusedWndId: 0,
      mask: false,
      timeoutHideMask: null,
      treeData: [],
      dialogAbout: false,
    }
  },
  computed: {
    VERSION() {
      return VERSION
    },
  },
  mounted() {
    if (this.client)
      return
    this.client = new XpraClient(this.$refs.desktop, '', 'admin')
    this.client.onOpen = () => {
      this.connecting = false
      this.decoder = new XpraDecoderWorkerHost(this.client.serverCaps['sound.encoders'])
    }
    this.client.onClose = () => {
      this.connecting = false
      this.disconnected = true
      if (this.decoder) {
        this.decoder.close()
        this.decoder = null
      }
    }
    this.client.onWndCreate = (wndId, wnd) => {
      // Override-redirect windows are relative positioned.
      if (wnd.metadata['override-redirect']) {
        const parentWnd = this.windows[wnd.metadata['transient-for']]
        if (parentWnd) {
          wnd.offsetX = parentWnd.x
          wnd.offsetY = parentWnd.y
        }
      }
      this.windows[wndId] = wnd
      if (this.launchingTimeout) {
        clearTimeout(this.launchingTimeout)
        this.launchingTimeout = 0
      }

      const dom = this.$refs['wnd_' + wndId]
      if (dom)
        this.windows[wndId].$ref = dom[0]
      else {
        // Will set $ref in wndReady()
      }
    }
    this.client.onWndClose = (wndId) => {
      // Window closed by client/server
      if (wndId in this.decoder.windows)
        this.decoder.removeWnd(wndId)
      if (wndId in this.windows)
        delete this.windows[wndId]
    }
    this.client.onWndMove = (wndId, x, y) => {
      const wnd = this.windows[wndId]
      if (!wnd)
        return
      wnd.x = x
      wnd.y = y
    }
    this.client.onWndMetadata = (wndId, metadata) => {
      const wnd = this.windows[wndId]
      if (!wnd)
        return

      const originPos = JSON.parse(sessionStorage.originPos || '{}')
      if (!wnd.metadata.fullscreen && metadata.fullscreen === true) {
        originPos[wndId] = {
          x: wnd.x,
          y: wnd.y,
          w: wnd.w,
          h: wnd.h
        }
        sessionStorage.originPos = JSON.stringify(originPos)
        this.fullscreen(wndId, wnd, false)
      }
      if (!wnd.metadata.maximized && metadata.maximized === true) {
        originPos[wndId] = {
          x: wnd.x,
          y: wnd.y,
          w: wnd.w,
          h: wnd.h
        }
        sessionStorage.originPos = JSON.stringify(originPos)
        this.fullscreen(wndId, wnd, true)
      }
      if ((wnd.metadata.fullscreen && metadata.fullscreen === false)
        || (wnd.metadata.maximized && metadata.maximized === false)) {
        let pos = originPos[wndId]
        // Restore the window size and position
        if (pos) {
          wnd.w = pos.w // Restore width/height first,
          wnd.h = pos.h // because vue-draggable-resizable will check constraints.
          nextTick().then(() => {
            wnd.x = pos.x // Now we can update the position.
            wnd.y = pos.y
            this.decoder.resize(wndId, wnd.w, wnd.h)
            this.client.moveWnd(wndId, wnd.x, wnd.y, wnd.w, wnd.h, wnd.props)
          })
        } else
          console.error('unable to get original position of windows')
      }
      wnd.metadata = Object.assign(wnd.metadata, metadata)
    }
    this.client.onWndRaise = (wndId) => {
      const unfocusedWndIds = Object.keys(this.windows).filter(t => t != wndId)
      const wnd = this.windows[wndId]
      if (wnd) {
        if (wnd.metadata['override-redirect'])
          return
        this.client.focusWnd(wndId, unfocusedWndIds, wnd.x, wnd.y, wnd.w, wnd.h, wnd.props)
        this.focusedWndId = wndId
      } else {
        this.client.focusWnd(0, [])
        this.focusedWndId = 0
      }
    }
    this.client.onWndResize = (wndId, w, h) => {
      const wnd = this.windows[wndId]
      if (!wnd)
        return
      wnd.w = w
      wnd.h = h
      this.decoder.resize(wndId, w, h)
    }
    this.client.onWndIcon = (wndId, w, h, url) => {
      this.windows[wndId].$ref.setIcon(w, h, url)
    }
    this.client.onPointerMove = (wndId, x, y) => {
      // Nothing to do.
    }
    this.client.onCursor = (w, h, hotX, hotY, url) => {
      for (const wndId in this.windows) {
        const dom = this.windows[wndId].$ref
        if (!dom)
          continue
        if (url)
          dom.setCursor(w, h, hotX, hotY, url)
        else
          dom.resetCursor()
      }
    }
    this.client.onEncodings = (encodings) => {
      for (const wndId in this.windows) {
        if (!(wndId in this.decoder.windows)) {
          const dom = this.windows[wndId].$ref
          if (!dom)
            continue
          const canvas = dom.$refs.canvas
          this.decoder.addWnd(wndId, canvas, encodings['encodings.allowed'])
        }
      }
      while (this.drawingQueue.length > 0) {
        const args = this.drawingQueue.shift()
        if (args[0] in this.decoder.windows)
          this.decoder.draw(...args)
      }
    }
    this.client.onSound = (...args) => {
      if (this.decoder)
        this.decoder.sound(...args)
    }
    this.client.onDraw = (wndId, x, y, srcWidth, srcHeight, encoding, data, seqId, rowStride, options) => {
      if (this.decoder) {
        const start = performance.now()
        const args = [
          wndId, x, y, srcWidth, srcHeight, encoding, data, seqId, rowStride, options,
          (message = '') => this.client.sendDecoderCallback(seqId, wndId, srcWidth, srcHeight, start, message),
        ]
        if (wndId in this.decoder.windows)
          this.decoder.draw(...args)
        else {
          console.info('server sent drawing packet, but the window', wndId, 'has not prepared.')
          this.drawingQueue.push(args)
        }
      }
    }
    this.client.onXdgMenu = (categories) => {
      let r = []
      for (const category in categories) {
        const t = {
          name: category,
          children: [],
          icon: CATEGORY_ICON[categories[category].Icon],
        }
        const entries = categories[category].Entries
        for (const appName in entries) {
          const item = {
            name: appName,
            command: entries[appName].Exec.replace(/%[uUfF]/g, ''),
            description: entries[appName].Comment,
          }
          if (entries[appName].IconUrl)
            item.img = entries[appName].IconUrl
          else
            item.icon = 'mdi-application-cog'
          t.children.push(item)
        }
        r.push(t)
      }
      this.treeData = r
    }

    this.client.open('xpra-ws')

    window.onfocus = (e) => {
      // Synchronize clipboard of client to server
      this.client.pushClipboard(e)
    }
    window.onblur = (e) => {
      // Release stuck keys & buttons
      this.client.releaseKeys()
      this.client.releaseButtons(e)
    }
    window.onresize = () => {
      setTimeout(() => {
        for (const wndId in this.windows) {
          const wnd = this.windows[wndId]
          if (wnd.metadata.fullscreen)
            this.fullscreen(wndId, wnd, false)
          else if (wnd.metadata.maximized)
            this.fullscreen(wndId, wnd, true)
          else
            this.client.repositionWnd(wndId, wnd)
        }
        this.client.screenResized()
      }, 200)
    }
    document.onvisibilitychange = () => {
      if (document.hidden)
        this.client.suspend(Object.keys(this.windows))
      else {
        this.client.resume(Object.keys(this.windows))
        this.client.refreshWnd()
      }
    }
    document.onkeydown = (e) => {
      if (this.focusedWndId == 0)
        return
      const allowDefault = this.client.keyEvent(e, true, this.focusedWndId)
      if (!allowDefault)
        e.preventDefault()
    }
    document.onkeyup = (e) => {
      if (this.focusedWndId == 0)
        return
      const allowDefault = this.client.keyEvent(e, false, this.focusedWndId)
      if (!allowDefault)
        e.preventDefault()
    }
  },
  methods: {
    hasTitle(wnd) {
      const wndType = wnd.metadata['window-type']
      if (!wndType)
        return false
      switch (wndType[0]) {
        case '':
        case 'NORMAL':
          return wnd.metadata.decorations != 0 && !wnd.metadata.fullscreen
        case 'DIALOG':
        case 'UTILITY':
          return true
        default:
          return false
      }
    },
    fullscreen(wndId, wnd, hasTitle) {
      wnd.x = 0
      wnd.y = 0
      wnd.w = this.$refs.desktop.clientWidth
      wnd.h = this.$refs.desktop.clientHeight - (hasTitle ? DECORATION_HEIGHT : 0)
      this.decoder.resize(wndId, wnd.w, wnd.h)
      this.client.moveWnd(wndId, wnd.x, wnd.y, wnd.w, wnd.h, wnd.props)
    },
    draggable(wnd) {
      if (wnd.metadata['override-redirect'] || wnd.metadata.fullscreen || wnd.metadata.maximized)
        return false
      return true
    },
    resizable(wnd) {
      if (wnd.metadata['override-redirect'] || wnd.metadata.fullscreen || wnd.metadata.maximized)
        return false
      const min = this.minSize(wnd)
      const max = this.maxSize(wnd)
      if (min[0] == max[0] && min[1] == max[1] && min[0] && min[1])
        return false
      return true
    },
    minSize(wnd) {
      const c = wnd.metadata['size-constraints']
      if (c && c['minimum-size'])
        return [
          c['minimum-size'][0],
          c['minimum-size'][1] + (this.hasTitle(wnd) ? DECORATION_HEIGHT : 0)
        ]
      else
        return [null, null]
    },
    maxSize(wnd) {
      const c = wnd.metadata['size-constraints']
      if (c && c['maximum-size'])
        return [
          c['maximum-size'][0],
          c['maximum-size'][1] + (this.hasTitle(wnd) ? DECORATION_HEIGHT : 0)
        ]
      else
        return [null, null]
    },
    forwardKey(pressed, button) {
      const mapping = {
        "{bksp}"	: "Backspace",
        "{enter}"	: "Enter",
        "{space}"	: "Space",
        "{tab}"		: "Tab",
        "{lock}"	: "CapsLock",
        "{shift}"	: "Shift",
        ".com"		: "|",
      }
      this.client.keyEvent({
        isComposing: false,
        key: mapping[button] || button,
        code: mapping[button] || button,
        getModifierState() { return false },
      }, pressed, this.focusedWndId)
    },
    wndReady(wndId, canvas) {
      this.windows[wndId].$ref = this.$refs['wnd_' + wndId][0]
      if (!this.client)
        return
      const encodings = this.client.serverCaps['encodings.allowed']
      if (encodings) {
        if (!(wndId in this.decoder.windows))
          this.decoder.addWnd(wndId, canvas, encodings)
      } else {
        // Add the window later, because server supported encodings are now unknown.
      }
    },
    focusWnd(wndId) {
      if (wndId != this.focusedWndId)
        this.client.onWndRaise(wndId)
    },
    pointerup(e, wndId = 0) {
      this.client.pointerActionEvent(e, false, wndId, this.windows)
    },
    pointerdown(e, wndId = 0) {
      if (wndId != this.focusedWndId)
        this.client.onWndRaise(wndId)

      this.client.pointerActionEvent(e, true, wndId, this.windows)
    },
    pointermove(e, wndId = 0) {
      this.client.pointerMoveEvent(e, wndId, this.windows)
    },
    wheel(e, wndId = 0) {
      // onmousewheel is deprecated. See
      // https://developer.mozilla.org/en-US/docs/Web/API/Element/wheel_event
      if (wndId == 0)
        this.client.wheelEvent(e)
      else
        this.client.wheelEvent(e, wndId,
          this.windows[wndId].x, this.windows[wndId].y)
    },
    maximize(wndId) {
      this.client.onWndMetadata(wndId, { maximized: true })
    },
    restore(wndId) {
      this.client.onWndMetadata(wndId, { maximized: false })
    },
    minimize(wndId) {
      const wnd = this.windows[wndId]
      wnd.metadata.iconic = true
    },
    showWindow(wndId) {
      const wnd = this.windows[wndId]
      wnd.metadata.iconic = false
      this.client.onWndRaise(wndId)
    },
    close(wndId) {
      const wnd = this.windows[wndId]
      if (Object.keys(this.windows).length > 0) {
        // Set focus to the next window
        for (const k in this.windows) {
          this.client.focusWnd(k, [wndId], wnd.x, wnd.y, wnd.w, wnd.h, wnd.props)
          this.focusedWndId = k
          break
        }
      } else {
        // No window focused
        this.client.focusWnd(0, [wndId], wnd.x, wnd.y, wnd.w, wnd.h, wnd.props)
        this.focusedWndId = 0
      }
      this.client.closeWnd(wndId) // trigger onWndClose()
    },
    resize(wndId, x, y, w, h) {
      const wnd = this.windows[wndId]
      if (this.hasTitle(wnd))
        h -= DECORATION_HEIGHT
      wnd.x = x
      wnd.y = y
      wnd.w = w
      wnd.h = h

      this.decoder.resize(wndId, w, h)
      this.client.moveWnd(wndId, x, y, w, h, wnd.props)

      if (this.timeoutHideMask)
        clearTimeout(this.timeoutHideMask)
      this.timeoutHideMask = setTimeout(() => {
        this.mask = false
        this.timeoutHideMask = null
      }, 200)
    },
    move(wndId, x, y) {
      const wnd = this.windows[wndId]
      wnd.x = x
      wnd.y = y
      this.client.moveWnd(wndId, x, y, wnd.w, wnd.h, wnd.props)
    },
    launchApp(item) {
      if (this.launchingTimeout == 0) {
        this.launchingTimeout = setTimeout(() => {
          this.launchingTimeout = 0
          this.client.notify(this.$t('error'), this.$t('launching_timeout'))
        }, 15 * 1000)
      }
      this.client.execute(item.name, item.command)
    },
  },
}
</script>

<style lang="scss">
@import "@mdi/font/scss/variables";
@import "@mdi/font/scss/functions";
.vdr {
  position:absolute;
}
.handle {
  position: absolute;
  opacity: .45;
}
.handle::before {
  content: mdi("resize-bottom-right");
  display: inline-block;
  font: normal normal normal #{$mdi-font-size-base}/1 '#{$mdi-font-name}'; // shortening font declaration
  font-size: inherit; // can't have font-size inherit on line above, so need to override
  text-rendering: auto; // optimizelegibility throws things off #1094
  line-height: inherit;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
.handle-tl {
  top: -10px;
  left: -5px;
  cursor: nw-resize;
  transform: scaleX(-1) scaleY(-1);
}
.handle-tm {
  top: -10px;
  left: 50%;
  margin-left: -5px;
  cursor: n-resize;
  transform: rotate(-135deg);
}
.handle-tr {
  top: -10px;
  right: -5px;
  cursor: ne-resize;
  transform: scaleY(-1);
}
.handle-ml {
  top: 50%;
  margin-top: -5px;
  left: -5px;
  cursor: w-resize;
  transform: rotate(135deg);
}
.handle-mr {
  top: 50%;
  margin-top: -5px;
  right: -5px;
  cursor: e-resize;
  transform: rotate(-45deg);
}
.handle-bl {
  bottom: -10px;
  left: -5px;
  cursor: sw-resize;
  transform: scaleX(-1);
}
.handle-bm {
  bottom: -10px;
  left: 50%;
  margin-left: -5px;
  cursor: s-resize;
  transform: rotate(45deg);
}
.handle-br {
  bottom: -10px;
  right: -5px;
  cursor: se-resize;
}
@media only screen and (max-width: 768px) {
  [class*="handle-"]:before {
    content: '';
    left: -10px;
    right: -10px;
    bottom: -10px;
    top: -10px;
    position: absolute;
  }
}
</style>

<style>
body {
  font-family: sans-serif;
}
.overlay {
  z-index: 10;
  display: flex;
  justify-content: center;
  align-items: center;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,.5);
  color: white;
  text-align: center;
}
.overlay a {
  color: white;
  font-weight: bold;
}
.desktop {
  display: block;
  position: relative;
  background: #ddd;
  width: 100%;
}
.fullscreen {
  z-index: 5;
  transform: translate3d(0px, 0px, 0px) !important;
}
</style>
