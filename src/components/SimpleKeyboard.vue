<template>
  <div :class="keyboardClass"></div>
</template>

<script>
/**
 * Copyright (c) 2022 Garen Fang <fungaren@qq.com>
 * -------------- The file has been tested on Xpra server version v4.3.2 ---------------
 * -------------------- and may not work on previous version -------------------------
 */
import Keyboard from "simple-keyboard"
import "simple-keyboard/build/css/index.css"

export default {
  name: "SimpleKeyboard",
  props: {
    keyboardClass: {
      default: "simple-keyboard",
      type: String
    },
    input: String,
  },
  data: () => ({
    keyboard: null
  }),
  mounted() {
    this.keyboard = new Keyboard(this.keyboardClass, {
      onChange: this.onChange,
      onKeyPress: this.onKeyPress,
      onKeyReleased: this.onKeyReleased,
      display : {
        "{bksp}"	: "Backspace",
        "{enter}"	: "Return",
        "{space}"	: "Space",
        "{tab}"		: "Tab",
        "{lock}"	: "CapsLock",
        "{shift}"	: "Shift",
        ".com"		: "|",
      },
    })
  },
  methods: {
    onChange(input) {
      this.$emit("change", input)
    },
    onKeyPress(button) {
      this.$emit("keyDown", button)

      if (button === "{shift}" || button === "{lock}") {
        this.keyboard.setOptions({
          layoutName: this.keyboard.options.layoutName === "default" ? "shift" : "default"
        })
      }
    },
    onKeyReleased(button) {
      this.$emit("keyUp", button)
    },
  },
  watch: {
    input(input) {
      this.keyboard.setInput(input)
    },
  },
}
</script>
