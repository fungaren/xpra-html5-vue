<template>
  <div class="xpra-wnd">
    <div class="wnd-title" :style="{width: (wnd.w - 8) + 'px'}"
      v-if="decoration" @dblclick="$emit('maximize', wndId)"
      @pointerdown="startMove" @pointerup="stopMove">
      <img width="24" height="24" :src="iconUrl"><img>
      <span>{{ wnd.metadata.title }}</span>
      <i class="mdi mdi-18px mdi-window-minimize" @click="$emit('minimize', wndId)"></i>
      <i v-show="!wnd.metadata.maximized" class="mdi mdi-18px mdi-window-maximize"
        @click="$emit('maximize', wndId)"></i>
      <i v-show="wnd.metadata.maximized" class="mdi mdi-18px mdi-window-restore"
        @click="$emit('restore', wndId)"></i>
      <i class="mdi mdi-18px mdi-window-close" @click="$emit('close', wndId)"></i>
    </div>
    <div class="wnd-body" ref="view"
      :style="{width: wnd.w + 'px', height: wnd.h + 'px', opacity: opacity}"
      @contextmenu.prevent.stop
      @pointerup="$emit('pointerUp', $event, wndId)"
      @pointerdown="$emit('pointerDown', $event, wndId)"
      @pointermove="$emit('pointerMove', $event, wndId)"
      @wheel.prevent="$emit('mouseWheel', $event, wndId)"
      @copy.prevent="$emit('copy', $event, wndId)"
      @cut.prevent="$emit('cut', $event, wndId)"
      @paste.prevent="$emit('paste', $event, wndId)">
      <!-- Use a mask to avoid focus lost when resizing the window -->
      <div class="mask" v-show="mask"></div>
      <canvas ref="canvas" :width="wnd.w" :height="wnd.h">
      </canvas>
    </div>
  </div>
</template>

<script>
/**
 * Copyright (c) 2022 Garen Fang <fungaren@qq.com>
 * -------------- The file has been tested on Xpra server version v4.3.2 ---------------
 * -------------------- and may not work on previous version -------------------------
 *
 * Copyright (c) 2013-2022 Antoine Martin <antoine@xpra.org>
 * Copyright (c) 2014 Joshua Higgins <josh@kxes.net>
 * Copyright (c) 2015-2016 Spikes, Inc.
 * Licensed under MPL 2.0
 */
import global from '../global'
const {platform} = global
/*
const Z_INDEX = {
  'NORMAL': 6,
  'UTILITY': 7,
  'DIALOG': 7,
  'DROPDOWN': 8,
  'TOOLTIP': 8,
  'POPUP_MENU': 8,
  'MENU': 8,
  'COMBO': 8,
}
*/
export default {
  name: 'XpraWnd',
  data() {
    return {
      iconUrl: '',
    }
  },
  props: {
    wndId: Number,
    wnd: Object,
    mask: Boolean,
    decoration: Boolean,
  },
  computed: {
    opacity() {
      const o = this.wnd.metadata.opacity
      if (o)
        return o < 0 ? 1.0 : o / 0x100000000
      else
        return 1
    },
  },
  mounted() {
    this.$emit('ready', this.wndId, this.$refs.canvas)
  },
  methods: {
    setIcon(w, h, url) {
      this.iconUrl = url
    },
    setCursor(w, h, hotX, hotY, url) {
      // If the browser zoomed, should scale the cursor image
      const zoom = 1
      if (zoom != 1 && platform != 'macos') {
        const img = new Image()
        img.onload = function() {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          ctx.imageSmoothingEnabled = true
          canvas.width = Math.round(w * window.devicePixelRatio)
          canvas.height = Math.round(h * window.devicePixelRatio)
          ctx.drawImage(this, 0, 0, canvas.width, canvas.height)
          // Convert the scaled image (on the canvas) to base64
          this.$refs.view.style.cursor = 'url("' + canvas.toDataURL() + '") ' +
            Math.round(hotX * window.devicePixelRatio) + ' ' +
            Math.round(hotY * window.devicePixelRatio) + ', auto'
        }
        img.src = url
      } else
        this.$refs.view.style.cursor = `url(${url}) ${hotX} ${hotY}, auto`
    },
    resetCursor() {
      if (this.$refs.view)
        this.$refs.view.style.cursor = 'default'
    },
    startMove() {
      if (this.wnd.metadata.fullscreen || this.wnd.metadata.maximized)
        return
      this.$emit('update:mask', true)
      this.$emit('focusWnd', this.wndId)
    },
    stopMove() {
      if (this.wnd.metadata.fullscreen || this.wnd.metadata.maximized)
        return
      this.$emit('update:mask', false)
    },
  },
}
</script>

<style scope>
.mask {
  z-index: 10;
  display: flex;
  justify-content: center;
  align-items: center;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,.1);
  color: white;
  text-align: center;
}
.xpra-wnd {
  display: inline-block;
  position: absolute;
}
.xpra-wnd .wnd-title {
  background: #777;
  color: #fff;
  display: flex;
  padding: 4px 4px;
  height: calc(32px - 8px);
}
.xpra-wnd .wnd-title span {
  font-weight: bold;
  flex-grow: 1;
  margin-left: 8px;
}
.xpra-wnd .wnd-title i {
  margin-left: 1px;
  padding: 0 4px;
  cursor: pointer;
}
.xpra-wnd .wnd-title i:hover {
  background: rgba(255, 255, 255, .5);
}
.xpra-wnd .wnd-body {
  position: relative;
}
.xpra-wnd .wnd-body canvas {
  position: absolute;
  left: 0;
  top: 0;
}
.xpra-wnd .wnd-body video {
  position: absolute;
  left: 0;
  top: 0;
}
</style>
