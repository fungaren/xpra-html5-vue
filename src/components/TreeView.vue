<template>
  <li>
    <div :class="['item', {folder: item.children, expand: opened}]" @click="toggle">
      <i class="mdi mdi-24px" :class="item.icon" v-if="item.icon"></i>
      <img :src="item.img" width="24" height="24" v-if="item.img"/>
      <span :title="item.description"> {{ item.name }}</span>
    </div>
    <ul v-show="opened" v-if="item.children">
      <TreeView v-for="(child, index) in item.children" :key="index" :item="child"
        @run="$emit('run', $event)"></TreeView>
    </ul>
  </li>
</template>

<script>
/**
 * Copyright (c) 2022 Garen Fang <fungaren@qq.com>
 * -------------- The file has been tested on Xpra server version v4.3.2 ---------------
 * -------------------- and may not work on previous version -------------------------
 */
export default {
  name: 'TreeView',
  data: () => ({
    opened: false,
  }),
  props: {
    item: Object,
  },
  methods: {
    toggle() {
      if (this.item.children)
        this.opened = !this.opened
      else
        this.$emit('run', this.item)
    },
  },
}
</script>

<style scoped>
ul {
  padding-left: 16px;
}
li {
  list-style: none;
}
.item {
  display: flex;
  line-height: 28px;
  align-items: center;
}
.item span {
  padding-left: 4px;
}
.folder {
  font-weight: bold;
}
.expand {
  color: blue;
}
</style>
