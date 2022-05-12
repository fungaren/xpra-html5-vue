/*
 * Copyright (c) 2022 Garen Fang <fungaren@qq.com>
 * -------------- The file has been tested on Xpra server version v4.3.2 ---------------
 * -------------------- and may not work on previous version -------------------------
 *
 * Copyright (c) 2021 Antoine Martin <antoine@xpra.org>
 * Licensed under MPL 2.0, see:
 * http://www.mozilla.org/MPL/2.0/
 *
 * This file is part of Xpra.
 */
import { randomBytes } from 'crypto'
import forge from 'node-forge'
import platform from 'platform'
const isWindows = platform.os.family.indexOf('Windows') >= 0
const isLinux = platform.os.family.indexOf('Linux') >= 0
const isMacOS = platform.os.family.indexOf('OS X') >= 0
const isIOS = platform.os.family.indexOf('iOS') >= 0
const isAndroid = platform.os.family.indexOf('Android') >= 0
const isSafari = platform.name.indexOf('Safari') >= 0
const isFirefox = platform.name.indexOf('Firefox') >= 0
const isChrome = platform.name.indexOf('Chrome') >= 0
const isIE = platform.name.indexOf('IE') >= 0
const $platform = (isWindows && 'windows') || (isLinux && 'linux') ||
  (isMacOS && 'macos') || (isIOS && 'ios') || (isAndroid && 'android') || 'unknown'
const $browser = (isSafari && 'safari') || (isFirefox && 'firefox') ||
  (isChrome && 'chrome') || (isIE && 'ie') || 'unknown'

const language = (navigator.languages && navigator.languages[0]) || navigator.language

import {CODE_TO_X11, NUMPAD_TO_X11, UNICODE_TO_X11, KEYSYM_TO_LAYOUT, LANGUAGE_TO_LAYOUT} from './constants'
import XpraProtocolWorkerHost from './protocol'
import {MSEAudioDecoder} from './decoder'
import {decodeLatin1, toBase64} from './buffer'

const SUPPORTED_KEYS = {
  // 0: "",
  // 1: "",
  // 2: "",
  // 3: "",
  // 4: "",
  // 5: "",
  // 6: "",
  // 7: "",
  8: "BackSpace",
  9: "Tab",
  // 10: "",
  // 11: "",
  12: "KP_Begin",
  13: "Return",
  // 14: "",
  // 15: "",
  16: "Shift_L",
  17: "Control_L",
  18: "Alt_L",
  19: "Pause", // Pause/Break
  20: "Caps_Lock",
  // 21: "",
  // 22: "",
  // 23: "",
  // 24: "",
  // 25: "",
  // 26: "",
  27: "Escape",
  // 28: "",
  // 29: "",
  // 30: "",
  31: "Mode_switch",
  32: "space",
  33: "Prior", // Page Up
  34: "Next", // Page Down
  35: "End",
  36: "Home",
  37: "Left",
  38: "Up",
  39: "Right",
  40: "Down",
  // 41: "",
  42: "Print",
  // 43: "",
  // 44: "",
  45: "Insert",
  46: "Delete",
  // 47: "",
  48: "0",
  49: "1",
  50: "2",
  51: "3",
  52: "4",
  53: "5",
  54: "6",
  55: "7",
  56: "8",
  57: "9",
  58: "colon",
  59: "semicolon",
  60: "less",
  61: "equal",
  62: "greater",
  63: "question",
  64: "at",
  65: "a",
  66: "b",
  67: "c",
  68: "d",
  69: "e",
  70: "f",
  71: "g",
  72: "h",
  73: "i",
  74: "j",
  75: "k",
  76: "l",
  77: "m",
  78: "n",
  79: "o",
  80: "p",
  81: "q",
  82: "r",
  83: "s",
  84: "t",
  85: "u",
  86: "v",
  87: "w",
  88: "x",
  89: "y",
  90: "z",
  91: "Menu", // Left Window Key
  92: "Menu", // Right Window Key
  93: "KP_Enter",
  // 94: "",
  // 95: "",
  96: "0", // "KP_0"
  97: "1", // "KP_1"
  98: "2", // "KP_2"
  99: "3", // "KP_3"
  100: "4", // "KP_4"
  101: "5", // "KP_5"
  102: "6", // "KP_6"
  103: "7", // "KP_7"
  104: "8", // "KP_8"
  105: "9", // "KP_9"
  106: "KP_Multiply",
  107: "KP_Add",
  // 108: "",
  109: "KP_Subtract",
  110: "KP_Delete",
  111: "KP_Divide",
  112: "F1",
  113: "F2",
  114: "F3",
  115: "F4",
  116: "F5",
  117: "F6",
  118: "F7",
  119: "F8",
  120: "F9",
  121: "F10",
  122: "F11",
  123: "F12",
  124: "F13",
  125: "F14",
  126: "F15",
  127: "F16",
  128: "F17",
  129: "F18",
  130: "F19",
  131: "F20",
  132: "F21",
  133: "F22",
  134: "F23",
  135: "F24",
  // 136: "",
  // 137: "",
  // 138: "",
  // 139: "",
  // 140: "",
  // 141: "",
  // 142: "",
  // 143: "",
  144: "Num_Lock",
  145: "Scroll_Lock",
  160: "dead_circumflex",
  161: "exclam",
  162: "quotedbl",
  163: "numbersign",
  164: "dollar",
  165: "percent",
  166: "ampersand",
  167: "underscore",
  168: "parenleft",
  169: "parenright",
  170: "asterisk",
  171: "plus",
  172: "bar",
  173: "minus",
  174: "braceleft",
  175: "braceright",
  176: "asciitilde",
  186: "semicolon",
  187: "equal",
  188: "comma",
  189: "minus",
  190: "period",
  191: "slash",
  192: "grave",
  219: "bracketleft",
  220: "backslash",
  221: "bracketright",
  222: "apostrophe",
}
const supportedKeys = []
for (const k in SUPPORTED_KEYS)
  supportedKeys.push([Number(k), SUPPORTED_KEYS[k], Number(k), 0, 0])

let uuid = ''
// randomUUID() in Node.js is not implemented in crypto-browserify currently.
const e = randomBytes(16)
uuid = e.subarray(0, 4).toString('hex') + '-' +
  e.subarray(4, 6).toString('hex') + '-' +
  e.subarray(6, 8).toString('hex') + '-' +
  e.subarray(8, 10).toString('hex') + '-' +
  e.subarray(10).toString('hex')

const LEVEL_ERROR = 40
const LEVEL_WARN = 30
const LEVEL_INFO = 20
const LEVEL_DEBUG = 10

const BTN_ACTION_LEFT = 1
const BTN_ACTION_MIDDLE = 2
const BTN_ACTION_RIGHT = 3
const BTN_ACTION_SCROLL_Y = 4
const BTN_ACTION_SCROLL_Y_ = 5
const BTN_ACTION_SCROLL_X = 6
const BTN_ACTION_SCROLL_X_ = 7
const BTN_ACTION_BROWSER_BACK = 8
const BTN_ACTION_BROWSER_FORWARD = 9

const DIRECTION_SIZE_TOP_LEFT = 0
const DIRECTION_SIZE_TOP = 1
const DIRECTION_SIZE_TOP_RIGHT = 2
const DIRECTION_SIZE_RIGHT = 3
const DIRECTION_SIZE_BOTTOM_RIGHT = 4
const DIRECTION_SIZE_BOTTOM = 5
const DIRECTION_SIZE_BOTTOM_LEFT = 6
const DIRECTION_SIZE_LEFT = 7
const DIRECTION_MOVE = 8
const DIRECTION_SIZE_KEYBOARD = 9
const DIRECTION_MOVE_KEYBOARD = 10
const DIRECTION_CANCEL = 11

const SOURCE_INDICATION_UNSET = 0
const SOURCE_INDICATION_NORMAL = 1
const SOURCE_INDICATION_PAGER = 2

const VERSION = '1.0.0'
const REVISION = 1000
const LOCAL_MODIFICATIONS = 0
const BRANCH = 'master'
const MACOS_SWAP_CTRL_META = false
const SCROLL_REVERSE_X = true
const SCROLL_REVERSE_Y = true
const CLIPBOARD_DELAY = 100

let n = document.createElement('div')
n.style.width = '1in'
n.style.height = '1in'
n.style.position = 'absolute'
n.style.top = 0
n.style.left = 0
n.style.visibility = 'hidden'
document.body.appendChild(n)
const Xdpi = n.offsetWidth
const Ydpi = n.offsetHeight
document.body.removeChild(n)

function randomStr(len) {
  return decodeLatin1(crypto.getRandomValues(new Uint8Array(len)))
}

function toPlainObjectDeep(o) {
  // Convert to normal object (Because Vue.js makes it become a Proxy/Observable)
  return JSON.parse(JSON.stringify(o))
}

function toPlainObject(o) {
  // Convert to normal object (Because Vue.js makes it become a Proxy/Observable)
  return Object.assign({}, o.$data || o)
}

class XpraClient {
  username = ''
  password = ''
  serverDisplay = ''

  containerDom = null
  protocol = null
  connected = false
  pressedKeys = []
  pressedButtons = []
  actingMoveResize = {}
  draggingOffsetX = null
  draggingOffsetY = null
  remainingDeltaX = 0
  remainingDeltaY = 0
  pingTimer = 0
  timestampPing = 0 // unit: milliseconds
  throttle = 0

  clientCaps = []
  serverCaps = []

  x11NumLock = ''
  x11Alt = ''
  x11Ctrl = ''
  x11Meta = ''
  x11AltGr = ''

  notificationAllow = false
  clipboardReadable = false
  clipboardWritable = false
  clipboardBusy = false // Somebody is using the clipboard
  clipboardBuffer = ''
  isPasting = false
  pendingKeyPackets = []
  clipboardDelayedTimer = 0

  onOpen = () => {}
  onClose = ()=>{}
  onWndCreate = ()=>{}
  onWndClose = ()=>{}
  onWndMove = ()=>{}
  onWndMetadata = ()=>{}
  onWndRaise = ()=>{}
  onWndResize = ()=>{}
  onWndIcon = ()=>{}
  onPointerMove = ()=>{}
  onCursor = ()=>{}
  onEncodings = ()=>{}
  onSound = ()=>{}
  onDraw = ()=>{}
  onXdgMenu = ()=>{}

  /**
   * Constructor
   * @param {HTMLElement} containerDom
   * @param {String} username
   * @param {String} password
   */
  constructor(containerDom, username='', password='') {
    this.$queryPermission('clipboard-read').then(e => this.clipboardReadable = e)
    this.$queryPermission('clipboard-write').then(e => this.clipboardWritable = e)
    // this.$queryPermission('notifications').then(e => this.notificationAllow = e)
    // https://developer.mozilla.org/zh-CN/docs/Web/API/Notification/requestPermission
    Notification.requestPermission().then(e => this.notificationAllow = e == 'granted')
    this.containerDom = containerDom
    this.username = username
    this.password = password
    this.protocol = new XpraProtocolWorkerHost((obj) => {
      switch (obj[0]) {
        case 'opened':
          console.log('websocket to xpra server connected')
          /* if (false)
            this.protocol.cipherIn({
              "cipher": "AES",
              "cipher.mode": "CBC", // CBC, CTR, CFB
              "cipher.iv": randomStr(16),
              "cipher.key_salt": randomStr(32),
              "cipher.key_size": 32, // 256 bits
              "cipher.key_hash": "sha1",
              "cipher.key_stretch": "PBKDF2",
              "cipher.key_stretch_iterations": 1000,
              "cipher.padding.options": [ "PKCS#7" ],
            }, this.password) */
          this.$sendHello()
          break
        case 'closed':
          {
            const reason = obj[1]
            console.warn('websocket closed:', reason)
            this.close()
          }
          break
        case 'disconnect':
          {
            const reason = obj[1]
            console.warn('xpra server closed the websocket:', reason)
            this.close()
          }
          break
        case 'error':
          {
            const reason = obj[1]
            const code = obj[2]
            console.warn('error:', code, reason)
            this.close()
          }
          break
        case 'challenge':
          if (this.password) {
            this.protocol.cipherOut(obj[2], this.password)
            const server_challenge = obj[1]
            const server_challenge_algorithm = obj[3]
            const client_challenge_algorithm = obj[4] || 'xor'
            const credential_type = obj[5] || 'password'
            console.info('the server requests your', credential_type)
            // TODO: Check the server challenge to protect user
            // against man-in-the-middle attack

            const client_key = randomStr(client_challenge_algorithm == 'xor' ? server_challenge.length : 32)
            const client_challenge = this.digest(client_challenge_algorithm, client_key, server_challenge)
            const challenge_response = this.digest(server_challenge_algorithm, this.password, client_challenge)
            // this.$sendHello(challenge_response, client_challenge)
          } else {
            console.error('the server requires your credentials but not specified')
            this.close()
          }
          break
        case 'startup-complete':
          console.log('startup complete')
          break
        case 'hello':
          {
            this.serverCaps = obj[1]
            console.log('server hello, with capabilities:', this.serverCaps)
            if (!this.serverCaps['rencodeplus']) {
              console.error('rencodeplus is not supported by server')
              this.close()
              break
            }
            const serverVersion = this.serverCaps['version'].split('.').map(t => Number(t))
            if (serverVersion[0] < 4 || serverVersion[1] < 3 || serverVersion[2] < 2) {
              console.error('unsupported server version:', this.serverCaps.version)
              this.close()
              break
            }
            this.connected = true
            this.$findModifier(this.serverCaps['modifier_keycodes'])

            // Only support AES
            if (this.serverCaps['cipher'] == 'AES') {
              this.protocol.cipherOut({
                "cipher": this.serverCaps['cipher'] || 'AES',
                "cipher.mode": this.serverCaps['cipher.mode'] || "CBC", // CBC, CTR, CFB
                "cipher.iv": this.serverCaps['cipher.iv'] || randomStr(16),
                "cipher.key_salt": this.serverCaps['cipher.key_salt'] || randomStr(32),
                "cipher.key_size": this.serverCaps['cipher.key_size'] || 32, // 256 bits
                "cipher.key_hash": this.serverCaps['cipher.key_hash'] || "sha1",
                "cipher.key_stretch": this.serverCaps['cipher.key_stretch'] || "PBKDF2",
                "cipher.key_stretch_iterations": this.serverCaps['cipher.key_stretch_iterations'] || 1000,
                // "cipher.padding": this.serverCaps['cipher.padding'],
                "cipher.padding.options": this.serverCaps['cipher.padding.options'] || [ "PKCS#7" ],
              }, this.password)
            }
            if (this.serverCaps['sound.send']) {
              if (!this.serverCaps['sound.encoders'])
                console.info('server does not support any audio encoder')
            } else
              console.info('server does not support sound forwarding')

            // const isDesktop = this.serverCaps['desktop']
            // const isShadow = this.serverCaps['shadow']
            // const readonly = this.serverCaps['readonly']
            // const resizeExact = this.serverCaps['resize_exact']
            // const screenSizes = this.serverCaps['screen-sizes']
            // const preciseWheel = this.serverCaps['wheel.precise']
            // const openFiles = this.serverCaps['open-files']
            // const fileTransfer = this.serverCaps['file-transfer']
            // const connectionData = this.serverCaps['connection-data']
            // const printing = this.serverCaps['printing']
            // if (printing)
            //   this.protocol.send(['printers', {
            //     'HTML5 client': {
            //       "printer-info": "Print to PDF in client browser",
            //       "printer-make-and-model": "HTML5 client version",
            //       "mimetypes": ["application/pdf"]
            //     },
            //   }])

            // if (navigator.connection && this.serverCaps['connection-data']) {
            //   navigator.connection.onchange = ()=>{
            //     this.protocol.send(['connection-data', {
            //       'type': navigator.connection.type,
            //       'effective-type': navigator.connection.effectiveType,
            //       'downlink': Math.round(navigator.connection.downlink * 1000 * 1000),
            //       'downlink.max': Math.round(navigator.connection.downlinkMax * 1000 * 1000),
            //       'rtt': navigator.connection.rtt,
            //     }])
            //   }
            // }

            // this.send(["sound-control", "start", this.audio_codec])
            // this.send(["sound-control", "stop"]);
            this.$requestInfo()
            // this.pingTimer = setInterval(() => {
            //   this.timestampPing = performance.now()
            //   this.protocol.send(['ping', Math.ceil(this.timestampPing)])
            // }, 5000)
            this.onOpen()
          }
          break
        case 'encodings':
          {
            const encodings = obj[1]
            console.log('update encodings:', encodings)
            this.serverCaps = Object.assign(this.serverCaps, encodings)
            this.onEncodings(encodings)
          }
          break
        case 'ping':
          {
            const systemTime = obj[1] // monotonic
            const serverTime = obj[2]
            const id = obj[3] || ''
            // console.log('server ping:', 'systemTime', systemTime,
            //   'serverTime', new Date(serverTime).toLocaleString(), 'id', id)
            this.protocol.send(['ping_echo', systemTime,
              0/* Load average 1 */,
              0/* Load average 2 */,
              0/* Load average 3 */,
              0, id])
          }
          break
        case 'ping_echo':
          {
            const systemTime = obj[1]
            const loadAvg = [obj[2]/1000, obj[3]/1000, obj[4]/1000]
            const clientLatency = obj[5]
            const serverLatency = performance.now() - this.timestampPing
            console.log('server ping echo', 'systemTime', systemTime, 'load average:', loadAvg)
            console.log('latency (ms): client:', clientLatency, 'server:', serverLatency)
          }
          break
        case 'info-response':
          {
            const info = obj[1]
            console.log('server info-response:', info)
            // setTimeout(() => {
            //   this.$requestInfo()
            // }, 1000)
          }
          break
        case 'new-tray':
          {
            const wndId = obj[1]
            const x = 0
            const y = 0
            const w = obj[2]
            const h = obj[3]
            const metadata = obj[4]
            console.log('creating new tray window:', 'wndId', wndId, 'x', x, 'y', y,
              'w', w, 'h', h, 'metadata', metadata)
            // TODO: Create a tray window
            // this.$createWnd(wndId, x, y, w, h, metadata, {}, false)
          }
          break
        case 'new-window':
          {
            const wndId = obj[1]
            const x = obj[2]
            const y = obj[3]
            const w = obj[4]
            const h = obj[5]
            const metadata = obj[6]
            const props = obj[7] || {}
            console.log('server creating window:', 'wndId', wndId, 'x', x, 'y', y,
              'w', w, 'h', h, 'metadata', metadata, 'props', props)
            this.$createWnd(wndId, x, y, w, h, metadata, props, false)
          }
          break
        case 'new-override-redirect':
          {
            const wndId = obj[1]
            const x = obj[2]
            const y = obj[3]
            const w = obj[4]
            const h = obj[5]
            const metadata = obj[6]
            const props = obj[7] || {}
            console.log('creating override-redirect window:', 'wndId', wndId, 'x', x, 'y', y,
              'w', w, 'h', h, 'metadata', metadata, 'props', props)
            this.$createWnd(wndId, x, y, w, h, metadata, props, true)
          }
          break
        case 'window-metadata':
          {
            const wndId = obj[1]
            const metadata = obj[2]
            console.log('server setting window metadata:', 'wndId', wndId, 'metadata', metadata)
            this.onWndMetadata(wndId, metadata)
          }
          break
        case 'lost-window':
          {
            const wndId = obj[1]
            console.log('server closing window:', 'wndId', wndId)
            this.onWndClose(wndId)
          }
          break
        case 'raise-window':
          {
            const wndId = obj[1]
            console.log('server raising window:', 'wndId', wndId)
            this.onWndRaise(wndId)
          }
          break
        case 'window-icon':
          {
            const wndId = obj[1]
            const w = obj[2]
            const h = obj[3]
            const encoding = obj[4]
            const data = obj[5]
            console.log('window icon:', 'wndId', wndId, 'w', w, 'h', h, 'encoding', encoding)

            const mime = 'image/' + encoding.split('/')[0]
            const url = 'data:' + mime + ';base64,' + toBase64(data)
            this.onWndIcon(wndId, w, h, url)
          }
          break
        case 'window-resized':
          {
            const wndId = obj[1]
            const w = obj[2]
            const h = obj[3]
            console.log('window resizing:', 'wndId', wndId, 'w', w, 'h', h)
            this.onWndResize(wndId, w, h)
          }
          break
        case 'window-move-resize':
        case 'configure-override-redirect':
          {
            const wndId = obj[1]
            const x = obj[2]
            const y = obj[3]
            const w = obj[4]
            const h = obj[5]
            console.log('window moving/resizing:', 'wndId', wndId, 'x', x, 'y', y, 'w', w, 'h', h)
            this.onWndMove(wndId, x, y)
            this.onWndResize(wndId, w, h)
          }
          break
        case 'initiate-moveresize':
          {
            const wndId = obj[1]
            const x = obj[2]
            const y = obj[3]
            const direction = obj[4]
            const button = obj[5]
            const source = obj[6]
            console.log('initiate-moveresize', 'wndId', wndId, 'x', x, 'y', y,
              'direction', direction, 'button', button, 'source', source)
            this.actingMoveResize = { wndId, x, y, direction, button, source }
          }
          break
        case 'pointer-position':
          {
            const wndId = obj[1]
            let x = obj[2]
            let y = obj[3]
            const relativeX = obj[4]
            const relativeY = obj[5]
            if (relativeX && relativeY) {
              // x = wnd.x + relativeX
              // y = wnd.y + relativeY
            }
            console.log('pointer moving:', 'wndId', wndId, 'x', x, 'y', y)
            this.onPointerMove(wndId, x, y)
          }
          break
        case 'desktop_size':
          {
            const w = obj[1]
            const h = obj[2]
            const maxW = obj[3]
            const maxH = obj[4]
            // TODO: resize containerDom
            console.log('server resizing desktop size:', 'w', w, 'h', h, 'maxW', maxW, 'maxH', maxH)
          }
          break
        case 'eos':
          {
            const wndId = obj[1]
            console.info('server send end-of-stream to window:', wndId)
          }
          break
        case 'draw':
          {
            const wndId = obj[1]
            const x = obj[2]
            const y = obj[3]
            const srcWidth = obj[4]
            const srcHeight = obj[5]
            const encoding = obj[6]
            const data = obj[7]
            const seqId = obj[8]
            const rowStride = obj[9]
            const options = obj[10] || {}
            // console.log('server draw:', 'wndId', wndId, 'x', x, 'y', y,
            //   'srcWidth', srcWidth, 'srcHeight', srcHeight, 'encoding', encoding,
            //   'seqId', seqId, 'rowStride', rowStride, 'options', options)
            this.onDraw(wndId, x, y, srcWidth, srcHeight, encoding, data, seqId, rowStride, options)
          }
          break
        case 'cursor':
          {
            if (obj.length < 9) {
              console.log('reset to default cursor for all windows')
              this.onCursor(0, 0, 0, 0, '')
              break
            }
            const encoding = obj[1]
            const w = obj[4]
            const h = obj[5]
            const hotX = obj[6]
            const hotY = obj[7]
            const data = obj[9]
            console.log('setting cursor for all windows:', 'w', w, 'h', h,
              'hotX', hotX, 'hotY', hotY, 'encoding', encoding)

            const mime = 'image/' + encoding.split('/')[0]
            const url = 'data:' + mime + ';base64,' + toBase64(data)
            this.onCursor(w, h, hotX, hotY, url)
          }
          break
        case 'bell':
          console.log('bell')
          // TODO: play sound
          break
        case 'notify_show':
          {
            const dBusId = obj[1]
            const notifyId = obj[2]
            const appName = obj[3]
            const replacesNotifyId = obj[4]
            const appIcon = obj[5]
            const summary = obj[6]
            const body = obj[7]
            const duration = obj[8]
            const iconType = obj[9][0]
            const iconData = obj[9][3]
            const actions = obj[10]
            const hints = obj[11]
            console.log('server notify:', 'dBusId', dBusId, 'notifyId', notifyId,
              'appName', appName, 'replacesNotifyId', replacesNotifyId, 'appIcon', appIcon,
              'duration', duration, 'iconType', iconType, 'actions', actions, 'hints', hints)

            this.notify(summary, body, 'data:image/png;base64,' + toBase64(iconData), () => {
              if (this.connected)
                this.protocol.send(['notification-close', notifyId, 2/* closedByUser */, '']
            )})
          }
          break
        case 'notify_close':
          {
            const notifyId = obj[1]
            console.log('close notification:', notifyId)
          }
          break
        case 'sound-data':
          {
            const codec = obj[1]
            const data = obj[2]
            const options = obj[3]
            const metadata = obj[4]
            console.log('sound data:', 'codec', codec, 'options', options, 'metadata', metadata)
            this.onSound(codec, data, options, metadata)
          }
          break
        case 'clipboard-token':
          {
            const selection = obj[1]
            const targets = obj[2]
            const target = obj[3]
            const dataType = (obj[4] || '').toLowerCase()
            const dataFormat = obj[5]
            const encoding = obj[6]
            const data = obj[7]

            if (obj.length >= 8) {
              console.log('server set clipboard:', 'selection', selection, 'targets', targets,
                'target', target, 'dataType', dataType, 'dataFormat', dataFormat,
                'encoding', encoding, 'data', data)
              if (this.clientCaps['clipboard.preferred-targets'].indexOf(target) < 0) {
                console.warn('unsupported clipboard target:', target)
                break
              }
            } else {
              console.log('server set clipboard:', 'selection', selection, 'targets', targets)
            }

            if (dataType.indexOf('string') >= 0 || dataType.indexOf('text') >= 0) {
              const t = data.toString('utf-8')
              this.clipboardBusy = true
              if (this.clipboardWritable) {
                navigator.clipboard.writeText(t).then(() => {
                  this.clipboardBuffer = t
                  this.clipboardBusy = false
                }).catch((e) => {
                  console.error(e)
                  this.clipboardBusy = false
                })
                break
              } else {
                // Store the clipboard data until the next pullClipboard() called.
              }
              this.clipboardBuffer = t
            } else {
              // TODO: how to get the clipboard data of the server?
            }
          }
          break
        case 'set-clipboard-enabled':
          {
            const enabled = obj[1]
            console.info('server set clipboard enabled:', enabled)
          }
          break
        case 'clipboard-request':
          {
            const reqId = obj[1]
            const selection = obj[2]
            const target = obj[3]
            console.log('server request clipboard data:', 'reqId', reqId,
              'selection', selection, 'target', target)
            if (!(selection in this.clientCaps['clipboard.selections'])) {
              this.$replyClipboard('', reqId)
              break
            }

            if (this.clipboardReadable) {
              this.clipboardBusy = true
              navigator.clipboard.readText().then((t) => {
                this.clipboardBuffer = t
                this.$replyClipboard(t, reqId)
                this.clipboardBusy = false
              }).catch(e => {
                console.error(e)
                this.$replyClipboard(this.clipboardBuffer, reqId)
                this.clipboardBusy = false
              })
              break
            }
            this.$replyClipboard(this.clipboardBuffer, reqId)
          }
          break
        case 'send-file':
          {
            const filename = obj[1]
            const mime = obj[2]
            const doPrint = obj[3]
            const size = obj[4]
            const data = obj[5]
            console.log('server send file:', 'filename', filename, 'mime', mime,
              'doPrint', doPrint, 'size', size)

            if (data.length != size) {
              console.error('data size', data.length, 'mismatch', size)
              break
            }
            if (doPrint) {
              // TODO: add support for printing
            } else {
              // TODO: add support for file download
            }
          }
          break
        case 'open-url':
          {
            const url = obj[1]
            console.log('server open url:', url)
            window.open(url, '_blank')
          }
          break
        case 'setting-change':
          {
            const setting = obj[1]
            const value = obj[2]
            console.log('server change setting', setting, 'to', value)
            if (setting == 'xdg-menu') {
              for (const category in value) {
                const entries = value[category].Entries
                for (const appName in entries) {
                  if (entries[appName].IconType && entries[appName].IconData) {
                    let mime = 'image/' + entries[appName].IconType.split('/')[0]
                    if (entries[appName].IconType == 'svg') mime += '+xml'
                    const url = 'data:' + mime + ';base64,' + toBase64(entries[appName].IconData)
                    entries[appName].IconUrl = url
                  }
                }
              }
              this.onXdgMenu(value)
            }
          }
          break
        default:
          console.error('unsupported command:', obj[0], obj)
          break
      }
    })
  }
  /**
   * Open websocket connection
   * @param {String} uri Websocket URL
   */
  open(uri) {
    let url = new URL(uri, window.location.href)
    url.protocol = url.protocol.replace('http', 'ws')
    this.protocol.open(url.toString())
  }
  /**
   * Close the websocket connection and release resources
   */
  close() {
    clearInterval(this.pingTimer)
    this.pingTimer = 0
    if (this.protocol) {
      this.protocol.close()
      this.protocol = null
    }
    this.connected = false
    this.onClose()
  }
  /**
   * Send log message to the server.
   * @param {Number} level Log level, should be one of LEVEL_DEBUG, LEVEL_INFO, LEVEL_WARN, LEVEL_ERROR
   * @param {Array} args Arguments
   */
  log(level, args) {
    if (this.connected && this.serverCaps['remote_logging']
      && this.serverCaps['server_remote_logging']) {
      args = args.map(e => unescape(encodeURIComponent(String(e))))
      this.protocol.send(['logging', level, ...args])
    }
  }
  /**
   * Send exception to the server.
   * @param {Error} e
   * @param  {...any} args
   */
  exception(e, ...args) {
    if (args.length > 0)
      console.error(args)

    if (e.stack)
      this.log(LEVEL_ERROR, [ e.stack ])
  }
  error() { this.log(LEVEL_ERROR, arguments) }
  warn() { this.log(LEVEL_WARN, arguments) }
  info() { this.log(LEVEL_INFO, arguments) }
  debug() { this.log(LEVEL_DEBUG, arguments) }
  $requestInfo() {
    if (this.connected)
      this.protocol.send(['info-request', [this.clientCaps['uuid']], [], []])
  }
  /**
   * Send callback for decoder
   * @param {Number} seqId
   * @param {Number} wndId
   * @param {Number} w
   * @param {Number} h
   * @param {Number} start Decode beginning time in milliseconds
   * @param {String} message Result message
   */
  sendDecoderCallback(seqId, wndId, w, h, start, message='') {
    const decodeTime = Math.round((performance.now() - start)*1000) // seconds
    if (this.connected)
      this.protocol.send(['damage-sequence', seqId, Number(wndId), w, h, decodeTime, message])
  }
  /**
   * Process keyboard events
   * @param {KeyboardEvent} e
   * @param {Boolean} pressed
   * @param {Number} focusedWndId
   * @returns AllowDefault
   */
  keyEvent(e, pressed, focusedWndId) {
    if (this.serverCaps['readonly'] || !this.connected)
      return true

    // An Input Method Editor (IME) is a program that
    // enables users to enter characters that are not
    // supported by their keyboard using some other
    // key combination.
    // The keydown and keyup events are fired during
    // IME composition. The actual key value can get
    // from KeyboardEvent.code
    if (e.isComposing || e.key == 'Process')
      return true

    // Following properties are deprecated:
    // KeyboardEvent.which, KeyboardEvent.keyCode,
    // KeyboardEvent.char, KeyboardEvent.charCode, ...
    // Use KeyboardEvent.key instead. See:
    // https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent

    // A dead "combining" key; that is, a key which is
    // used in tandem with other keys to generate accented
    // and other modified characters.
    // For instance, when input ‘à’ on US. intl. (With AltGr
    // Dead keys), the event sequence is like:
    //
    // e.key == 'AltGraph' && e.code == 'AltRight'
    // e.key == 'Dead' && e.code == 'Backquote'
    // e.key == 'à' && e.code == 'KeyA'
    //
    // And if pressed by itself, it doesn't generate a character.
    // https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values

    let allowDefault = false
    if (e.key == 'Shift' || e.key == 'Control' || e.key == 'Meta')
      allowDefault = true
    else if (e.getModifierState('Shift') && e.key == 'Insert')
      allowDefault = true
    else if (e.getModifierState('Control') || e.getModifierState('Mate')) {
      if (e.code == 'KeyC' || e.code == 'KeyX') {
        allowDefault = true
      } else if (e.code == 'KeyV') {
        allowDefault = true // triggering onPaste()
        this.isPasting = true
      }
    } else if (e.code == 'F6' || e.code == 'F11' || e.code == 'F12')
      allowDefault = true

    const modifiers = this.$convertModifiers(e)
    let x11Name = ''
    if (e.key == 'AltGraph') {
      x11Name = 'ISO_Level3_Shift'
      modifiers.push(this.x11AltGr)
    } else if (e.key.length == 1 && e.key.charCodeAt(0) in UNICODE_TO_X11) {
      x11Name = UNICODE_TO_X11[e.key.charCodeAt(0)]
      if (x11Name.indexOf('_') >= 1) {
        // We need specific keyboard layout to input the special key
        // const keyboardLayout = KEYSYM_TO_LAYOUT[x11Name.split('_')[0]]
        // this.protocol.send(['layout-changed', keyboardLayout, ''])
      }
    } else if (e.code in CODE_TO_X11) {
      x11Name = CODE_TO_X11[e.code]
    } else if (e.code != e.key && e.code in NUMPAD_TO_X11) {
      x11Name = NUMPAD_TO_X11[e.code]
    } else {
      console.log('ignore keyboard event: key:', e.key, 'code:', e.code)
      return true
    }
    let x11Code = -1
    for (const k in SUPPORTED_KEYS) {
      if (SUPPORTED_KEYS[k] == x11Name) {
        x11Code = k
        break
      }
    }
    this.$sendKey(x11Name,
      x11Code == -1 ? e.key.charCodeAt(0) : x11Code,
      e.key,
      modifiers,
      pressed,
      focusedWndId
    )
    return allowDefault
  }
  /**
   * Send key event
   * @param {String} x11Name
   * @param {Number} x11Code
   * @param {String} key
   * @param {Array} modifiers
   * @param {Boolean} pressed
   * @param {Number} focusedWndId
   */
  $sendKey(x11Name, x11Code, key, modifiers, pressed, focusedWndId) {
    const pkt = [
      'key-action', Number(focusedWndId), x11Name, pressed,
      modifiers, Number(x11Code), key, x11Code, 0// group: ?
    ]
    console.log(pressed ? '⇩' : '⇧', 'x11Name:', x11Name, 'x11Code', x11Code, 'key', key, 'modifiers', modifiers)
    if (this.isPasting) {
      // We should first push the clipboard data to the server,
      // then send the paste instruction. If not, the server will
      // paste dirty data.
      this.pendingKeyPackets.push(pkt)
      if (this.clipboardDelayedTimer == 0) {
        this.clipboardDelayedTimer = setTimeout(() => {
          if (!this.connected) {
            this.pendingKeyPackets = []
            this.clipboardDelayedTimer = 0
            this.isPasting = false
            return
          }
          for (let i = 0; i < this.pendingKeyPackets.length; i++)
            this.protocol.send(toPlainObjectDeep(this.pendingKeyPackets[i]))

          this.pendingKeyPackets = []
          this.clipboardDelayedTimer = 0
          this.isPasting = false
        }, CLIPBOARD_DELAY)
      }
    } else
      this.protocol.send(pkt)
  }
  /**
   * Converts modifiers into X11 convention.
   * @returns An array with modifiers
   */
  $convertModifiers(e) {
    const modifiers = []
    if (e.getModifierState) {
      if (e.getModifierState("Control"))
        modifiers.push(MACOS_SWAP_CTRL_META ? this.x11Meta : this.x11Ctrl)

      if (e.getModifierState("Meta"))
        modifiers.push(MACOS_SWAP_CTRL_META ? this.x11Ctrl : this.x11Meta)

      if (e.getModifierState("Alt"))
        modifiers.push(this.x11Alt)

      if (e.getModifierState("CapsLock"))
        modifiers.push("lock")

      if (e.getModifierState("Shift"))
        modifiers.push("shift")

      if (e.getModifierState("NumLock"))
        modifiers.push(this.x11NumLock)

      // Seems unsupported?
      // if (e.getModifierState("AltGraph"))
      //   modifiers.push(this.x11AltGr)

      // ScrollLock
      // Fn
    }
    if (modifiers.length != 0)
      console.log('modifiers:', modifiers)
    return modifiers
  }
  /**
   * Release keyboard buttons. If a user pressed a key in
   * the window and released outside, the window will not
   * receive the release event. Hence we should send an event
   * by manual.
   */
  releaseKeys() {
    if (this.serverCaps['readonly'] || !this.connected)
      return

    for (const pkt of this.pressedKeys) {
      console.log("releasing stuck key:", pkt)
      pkt[3] = false // unpressed
      this.protocol.send(pkt)
    }
    this.pressedKeys = []
  }
  /**
   * Process pointer events
   * @param {PointerEvent} e
   * @param {Number} wndId 0 for no window
   * @param {Object} windows wndId as key, window object as value
   */
  pointerMoveEvent(e, wndId, windows) {
    // A pointer is a hardware agnostic representation of
    // input devices (such as a mouse, pen or contact point
    // on a touch-enable surface). The pointer can target a
    // specific coordinate (or set of coordinates) on the
    // contact surface such as a screen. See:
    // https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent
    if (e.offsetX < 0 || e.offsetY < 0)
      return // Throttle

    if (this.serverCaps['readonly'] || !this.connected)
      return

    // e.clientX, e.clientY relative to local browser (DOM content).
    // e.screenX, e.screenY relative to (global) screen.
    // e.offsetX, e.offsetY relative to the position of the padding edge of the target node.
    // e.pageX, e.pageY relative to the whole document.
    const posX = Math.round(e.offsetX + windows[wndId]?.x || 0)
    const posY = Math.round(e.offsetY + windows[wndId]?.y || 0)

    const p = this.actingMoveResize
    if (p.direction == DIRECTION_MOVE) {
      if (this.draggingOffsetX === null) {
        this.draggingOffsetX = p.x - windows[p.wndId].x
        this.draggingOffsetY = p.y - windows[p.wndId].y
      }
      this.onWndMove(p.wndId, posX - this.draggingOffsetX, posY - this.draggingOffsetY)
      return
    }

    const now = performance.now()
    if (now - this.throttle < 20)
      return // Limit the event frequency to 50fps
    else
      this.throttle = now

    // console.log('mouse position:', posX, posY)
    this.protocol.send(['pointer-position', Number(wndId), [ posX, posY ],
      this.$convertModifiers(e), []])
  }
  /**
   * Process pointer events
   * @param {PointerEvent} e
   * @param {Boolean} pressed
   * @param {Number} wndId
   * @param {Object} windows wndId as key, window object as value
   */
  pointerActionEvent(e, pressed, wndId, windows) {
    if (e.offsetX < 0 || e.offsetY < 0)
      return // Throttle

    if (this.serverCaps['readonly'] || !this.connected)
      return

    const p = this.actingMoveResize
    if (p.direction == DIRECTION_MOVE && !pressed) {
      const wnd = windows[p.wndId]
      this.moveWnd(p.wndId, wnd.x, wnd.y, wnd.w, wnd.h, toPlainObject(wnd.props))
      this.actingMoveResize = {}
      this.draggingOffsetX = null
      this.draggingOffsetY = null
    }

    let button = null
    switch(e.button) {
      case 0:
        button = BTN_ACTION_LEFT
        break
      case 1:
        button = BTN_ACTION_MIDDLE
        break
      case 2:
        button = BTN_ACTION_RIGHT
        break
      case 3:
        button = BTN_ACTION_BROWSER_BACK
        break
      case 4:
        button = BTN_ACTION_BROWSER_FORWARD
        break
    }
    if (pressed)
      this.pressedButtons.push(button)
    else
      this.pressedButtons.splice(this.pressedButtons.indexOf(button), 1)

    const posX = Math.round(e.offsetX + (windows[wndId]?.x || 0))
    const posY = Math.round(e.offsetY + (windows[wndId]?.y || 0))
    console.log(pressed ? '⇩' : '⇧', 'wndId', wndId, 'button', button, 'x', posX, 'y', posY)

    // As we called pushClipboard() when user clicked the document,
    // we should wait for the server to update the clipboard.
    // If not, the server may paste dirty data.
    setTimeout(() => {
      this.protocol.send(['button-action', Number(wndId), button, pressed, [ posX, posY ],
        this.$convertModifiers(e), [],
      ])
    }, CLIPBOARD_DELAY)
  }
  /**
   * Release pointer buttons. If a user pressed a button in
   * the window and released outside, the window will not
   * receive the release event. Hence we should send an event
   * by manual.
   * @param {Event} e
   * @param {Number} wndId
   * @param {Number} x
   * @param {Number} y
   */
  releaseButtons(e, wndId = 0, x = 0, y = 0) {
    if (this.serverCaps['readonly'] || !this.connected)
      return

    for (const button of this.pressedButtons) {
      console.log("releasing stuck button:", button)
      this.protocol.send(['button-action', Number(wndId), button, false, [ x, y ],
        this.$convertModifiers(e), [],
      ])
    }
    this.pressedButtons = []
  }
  /**
   * Process wheel events
   * @param {WheelEvent} e
   * @param {Number} wndId
   * @param {Number} wndX
   * @param {Number} wndY
   */
  wheelEvent(e, wndId = 0, wndX = 0, wndY = 0) {
    if (this.serverCaps['readonly'] || !this.connected)
      return

    // https://developer.mozilla.org/en-US/docs/Web/API/WheelEvent
    let px, py
    switch (e.deltaMode) {
      case WheelEvent.DOM_DELTA_PIXEL:
        px = e.deltaX
        py = e.deltaY
        break
      case WheelEvent.DOM_DELTA_LINE:
        px = e.deltaX * 40
        py = e.deltaY * 40
        break
      case WheelEvent.DOM_DELTA_PAGE:
        px = e.deltaX * 800
        py = e.deltaY * 800
        break
    }
    if (SCROLL_REVERSE_X)
      px = -px
    if (SCROLL_REVERSE_Y)
      py = -py

    const modifiers = this.$convertModifiers(e)
    const posX = Math.round(e.offsetX + wndX)
    const posY = Math.round(e.offsetY + wndY)

    if (this.serverCaps['wheel.precise']) {
      if (px != 0)
        this.protocol.send(['wheel-motion', Number(wndId),
          px >= 0 ? BTN_ACTION_SCROLL_X : BTN_ACTION_SCROLL_X_,
          -Math.round(px*1000/120), // smooth the scrolling
          [ posX, posY ], modifiers, [],
        ])
      if (py != 0)
        this.protocol.send(['wheel-motion', Number(wndId),
          py >= 0 ? BTN_ACTION_SCROLL_Y_ : BTN_ACTION_SCROLL_Y,
          -Math.round(py*1000/120), // smooth the scrolling
          [ posX, posY ], modifiers, [],
        ])
    } else {
      this.remainingDeltaX += px
      this.remainingDeltaY += py
      while (Math.abs(this.remainingDeltaX) >= 120) {
        this.protocol.send(['button-action', Number(wndId),
          this.remainingDeltaX >= 0 ? BTN_ACTION_SCROLL_X : BTN_ACTION_SCROLL_X_, true,
          [ posX, posY ], modifiers, [],
        ])
        this.protocol.send(['button-action', Number(wndId),
          this.remainingDeltaX >= 0 ? BTN_ACTION_SCROLL_X : BTN_ACTION_SCROLL_X_, false,
          [ posX, posY ], modifiers, [],
        ])
        if (this.remainingDeltaX >= 120)
          this.remainingDeltaX -= 120
        else if (this.remainingDeltaX <= -120)
          this.remainingDeltaX += 120
      }
      while (Math.abs(this.remainingDeltaY) >= 120) {
        this.protocol.send(['button-action', Number(wndId),
          this.remainingDeltaY >= 0 ? BTN_ACTION_SCROLL_Y : BTN_ACTION_SCROLL_Y_, true,
          [ posX, posY ], modifiers, [],
        ])
        this.protocol.send(['button-action', Number(wndId),
          this.remainingDeltaY >= 0 ? BTN_ACTION_SCROLL_Y : BTN_ACTION_SCROLL_Y_, false,
          [ posX, posY ], modifiers, [],
        ])
        if (this.remainingDeltaY >= 120)
          this.remainingDeltaY -= 120
        else if (this.remainingDeltaY <= -120)
          this.remainingDeltaY += 120
      }
    }
  }
  /**
   * Set window focused. Beware an override-redirect window cannot be focused.
   * @param {Number} focusedWndId Focused window id. 0 for non-focused.
   * @param {Array} unfocusedWndIds Array of unfocused window ids.
   * @param {Number} x
   * @param {Number} y
   * @param {Number} w
   * @param {Number} h
   * @param {Object} props Client properties
   */
  focusWnd(focusedWndId, unfocusedWndIds, x, y, w, h, props) {
    if (this.serverCaps['readonly'] || !this.connected)
      return

    this.protocol.send(['focus', Number(focusedWndId), []])
    if (focusedWndId) {
      this.protocol.send(['configure-window', Number(focusedWndId), x, y, w, h,
        toPlainObject(props), 0, {focused: true}, true/* ignorePosition */])
    }
    for (const wndId of unfocusedWndIds) {
      this.protocol.send(['configure-window', Number(wndId), x, y, w, h,
        toPlainObject(props), 0, {focused: false}, true/* ignorePosition */])
    }
  }
  async $queryPermission(name) {
    // https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API
    try {
      await navigator.permissions.query({ name })
      return true
    } catch (e) {
      console.info(name, 'permission rejected:', e.toString())
      return false
    }
  }
  /**
   * Pull clipboard data from the server
   * @param {ClipboardEvent} e
   */
  pullClipboard(e) {
    if (this.clipboardBusy)
      return

    const t = decodeURIComponent(escape(this.clipboardBuffer))
    if (this.clipboardWritable) {
      this.clipboardBusy = true
      navigator.clipboard.writeText(t).then(() => {
        this.clipboardBusy = false
      }).catch((e) => {
        console.error(e)
        this.clipboardBusy = false
      })
    } else if (e.clipboardData) {
      e.clipboardData.setData("text/plain", t)
    } else {
      console.warn('unable to set clipboard data')
    }
  }
  /**
   * Synchronize client clipboard text to the server
   * @param {ClipboardEvent} e
   */
  pushClipboard(e) {
    if (this.clipboardBusy)
      return

    if (this.clipboardReadable) {
      this.clipboardBusy = true
      navigator.clipboard.readText().then((t) => {
        this.$sendClipboard(t)
        this.clipboardBusy = false
      }).catch(e => {
        console.error(e)
        this.clipboardBusy = false
      })
    } else if (e.clipboardData) {
      // https://developer.mozilla.org/en-US/docs/Web/API/ClipboardEvent
      const t = e.clipboardData.getData("text/plain")
      this.$sendClipboard(t)
    } else {
      console.info('no available clipboard data')
    }
  }
  $sendClipboard(t) {
    t = unescape(encodeURIComponent(t))
    if (t == this.clipboardBuffer)
      return

    if (this.serverCaps['readonly'] || !this.connected)
      return

    console.log('pushing new clipboard data')
    this.clipboardBuffer = t
    if (t)
      this.protocol.send(['clipboard-token', 'CLIPBOARD',
        ['UTF8_STRING', 'text/plain'],
        'UTF8_STRING', 'UTF8_STRING'/* dataType */,
        8/* dataFormat */,
        'bytes'/* encoding */, t,
        true/* claim */,
        true/* greedy */,
        true/* synchronous */,
      ])
    else
      this.protocol.send(['clipboard-token', 'CLIPBOARD',
        [],
        '', '',
        8/* dataType */,
        'bytes'/* encoding */, '',
        true/* claim */,
        true/* greedy */,
        true/* synchronous */,
      ])
  }
  $replyClipboard(t, reqId) {
    if (t)
      this.protocol.send(['clipboard-contents', reqId, 'CLIPBOARD',
        'UTF8_STRING'/* dataType */,
        8/* dataFormat */, 'bytes'/* encoding */, t
      ])
    else
      this.protocol.send(['clipboard-contents-none', reqId, 'CLIPBOARD'])
  }
  /**
   * Send file to server
   * @param {File} file
   */
  async sendFile(file) {
    // https://developer.mozilla.org/en-US/docs/Web/API/File
    const data = await file.arrayBuffer()
    this.protocol.send(['send-file', file.name, file.type,
      false, this.serverCaps['open-files'], file.size, data, {},
    ])
  }
  /**
   * Execute command in the server
   * @param {String} name Command name (anything)
   * @param {String} command Command to execute
   */
  execute(name, command) {
    if (this.serverCaps['readonly'] || !this.connected)
      return
    this.protocol.send(['start-command', name, command, 'False'])
  }
  $sendHello(challengeResponse, clientChallenge) {
    const keyboardLayout = LANGUAGE_TO_LAYOUT[language] || 'us'
    let algorithms = Object.keys(forge.md.algorithms).map(t => ('hmac+' + t))
    algorithms = algorithms.concat(['hmac', 'xor'])
    this.clientCaps = {
      'version': VERSION,
      'build.revision': REVISION,
      'build.local_modifications': LOCAL_MODIFICATIONS,
      'build.branch': BRANCH,
      'platform': $platform,
      'platform.name': $platform,
      'platform.processor': 'vue.js',
      'platform.platform': $browser,
      'session-type': platform.description,
      'session-type.full': platform.ua,
      'namespace': true,
      'clipboard': true,
      'clipboard.want_targets': true,
      'clipboard.greedy': true,
      'clipboard.selections': ['CLIPBOARD'], // PRIMARY is removed
      'clipboard.contents-slice-fix': true,
      'clipboard.preferred-targets': [
        "UTF8_STRING", "TEXT", "STRING", "text/plain",
      ],
      'notifications': true,
      'notifications.close': true,
      'notifications.actions': true,
      'share': false,
      'steal': true,
      'client_type': 'HTML5',
      'websocket.multi-packet': true,
      'setting-change': true,
      'username': this.username,
      'display': this.serverDisplay,
      'uuid': uuid,
      'argv': [ window.location.href ],
      'digest': algorithms,
      'salt-digest': algorithms,
      'zlib': true,
      'compression_level': 1,
      'mouse.show': true,
      'cursors': true,
      'named_cursors': false, // GTK only
      'bell': true,
      'system_tray': true,
      'file-transfer': false, // not supported yet
      'file-size-limit': 10,
      'flush': true,
      'printing': false, // not supported yet
      'rencode': false,
      'rencodeplus': true, // only support rencodeplus
      'bencode': false,
      'yaml': false,
      'open-url': true,
      'ping-echo-sourceid': true,
      'vrefresh': -1,
      'lz4': true,
      'brotli': true,
      'auto_refresh_delay': 500,
      'randr_notify': true,
      'server-window-resize': true,
      'screen-resize-bigger': false,
      'metadata.supported': [
        'fullscreen', 'maximized', 'iconic', 'above', 'below',
        'title', 'size-hints', 'class-instance', 'transient-for',
        'window-type', 'has-alpha', 'decorations',
        'override-redirect', 'tray', 'modal', 'opacity',
        // 'set-initial-position', 'group-leader', 'shadow', 'desktop'
      ],
      'encoding': 'auto',
      'encoding.rgb_lz4': true,
      'encoding.icons.max_size': [30, 30],
      'encoding.scrolling': true,
      // 'encoding.scrolling.min-percent': 30,
      'encoding.flush': true,
      'encoding.transparency': true,
      'encoding.decoder-speed': { video: 0 },
      // 'encoding.min-speed': 80,
      // 'encoding.min-quality': 50,
      'encoding.color-gamut': '',
      "encoding.video_scaling": true,
      "encoding.video_max_size": [1024, 768],
      "encoding.eos": true,
      "encoding.full_csc_modes": {
        "mpeg1": ["YUV420P"],
        "h264": ["YUV420P"],
        "mpeg4+mp4": ["YUV420P"],
        "h264+mp4": ["YUV420P"],
        "vp8+webm": ["YUV420P"],
        "webp": ["BGRX", "BGRA"],
        "jpeg": [
          "BGRX", "BGRA", "BGR", "RGBX", "RGBA", "RGB",
          "YUV420P", "YUV422P", "YUV444P",
        ],
      },
      // this is a workaround for server versions between 2.5.0 to 2.5.2 only:
      "encoding.x264.YUV420P.profile": "baseline",
      "encoding.h264.YUV420P.profile": "baseline",
      "encoding.h264.YUV420P.level": "2.1",
      "encoding.h264.cabac": false,
      "encoding.h264.deblocking-filter": false,
      "encoding.h264.fast-decode": true,
      "encoding.h264+mp4.YUV420P.profile": "baseline",
      "encoding.h264+mp4.YUV420P.level": "3.0",
      // prefer native video in mp4/webm container to broadway plain h264:
      "encoding.h264.score-delta": -20,
      "encoding.h264+mp4.score-delta": 50,
      "encoding.h264+mp4.": 50,
      // "encoding.h264+mp4.fast-decode": true,
      "encoding.mpeg4+mp4.score-delta": 40,
      // "encoding.mpeg4+mp4.fast-decode": true,
      "encoding.vp8+webm.score-delta": 40,
      'sound.receive': true,
      'sound.send': false,
      'sound.server_driven': true,
      'sound.decoders': MSEAudioDecoder.supportedCodecs(),
      'sound.bundle-metadata': true,
      'encodings': [
        "jpeg", "png", "png/P", "png/L", "webp",
        "rgb", "rgb32", "rgb24",
        "scroll", "void", "avif",
      ],
      'encodings.core': [
        "jpeg", "png", "png/P", "png/L", "webp",
        "rgb", "rgb32", "rgb24",
        "scroll", "void", "avif",
      ],
      'encodings.rgb_formats': [ "RGBX", "RGBA", "RGB" ],
      'encodings.window-icon': [ 'png' ],
      'encodings.cursor': [ 'png' ],
      'encodings.packet': true,
      'windows': true,
      'window.pre-map': true,
      'keyboard': true,
      'xkbmap_layout': keyboardLayout,
      'xkbmap_keycodes': supportedKeys,
      'xkbmap_print': '',
      'xkbmap_query': '',
      'desktop_size': [this.containerDom.clientWidth, this.containerDom.clientHeight],
      'desktop_mode_size': [this.containerDom.clientWidth, this.containerDom.clientHeight],
      'screen_sizes': this.$screenSizes(),
      'dpi': Math.round((Xdpi + Ydpi) / 2),
      'xdg-menu-update': true,
      // 'bandwidth-limit': 1000,
      // // https://developer.mozilla.org/zh-CN/docs/Web/API/Navigator/connection
      // 'connection-data': {
      //   'type': navigator.connection.type,
      //   'effective-type': navigator.connection.effectiveType,
      //   'downlink': Math.round(navigator.connection.downlink * 1000 * 1000),
      //   'downlink.max': Math.round(navigator.connection.downlinkMax * 1000 * 1000),
      //   'rtt': navigator.connection.rtt,
      // },
      // 'start-new-session': true,
    }
    if (challengeResponse) {
      // Tell the server we expect a challenge
      this.clientCaps['challenge'] = true
      const cap = {
        "cipher": "AES",
        "cipher.mode": "CBC", // CBC, CTR, CFB
        "cipher.iv": randomStr(16),
        "cipher.key_salt": randomStr(32),
        "cipher.key_size": 32, // 256 bits
        "cipher.key_hash": "sha1",
        "cipher.key_stretch": "PBKDF2",
        "cipher.key_stretch_iterations": 1000,
        "cipher.padding.options": [ "PKCS#7" ],
      }
      this.protocol.cipherIn(cap, this.password)
      this.clientCaps = Object.assign(this.clientCaps, cap)
      this.clientCaps['challenge_response'] = challengeResponse
      this.clientCaps['challenge_client_salt'] = clientChallenge
    }
    for (const k in this.clientCaps) {
      if (this.clientCaps[k] == null)
        throw 'the value of' + k + 'in clientCaps is null'
    }
    this.protocol.send(['hello', this.clientCaps])
  }
  $screenSizes() {
    const w = this.containerDom.clientWidth
    const h = this.containerDom.clientHeight
    // Screen width in millimeter
    const _w = Math.round(w*25.4/Xdpi)
    // Screen height in millimeter
    const _h = Math.round(h*25.4/Ydpi)
    return [[
      'HTML', w, h, _w, _h,
      [[ 'Canvas', 0, 0, w, h, _w, _h ]],
      0, 0, _w, _h
    ]]
  }
  /**
   * Notify the server to resize the screen
   */
  screenResized() {
    if (this.serverCaps['readonly'] || !this.connected)
      return

    const now = performance.now()
    if (now - this.throttle < 50)
      return // Limit the event frequency to 20fps
    else
      this.throttle = now

    const w = this.containerDom.clientWidth
    const h = this.containerDom.clientHeight
    console.log('resizing desktop:', w, h)
    this.protocol.send(['desktop_size', w, h, this.$screenSizes()])
  }
  $digest(algorithm, key, s) {
    if (algorithm.startsWith('hmac')) {
      const hmac = forge.hmac.create()
      hmac.start(algorithm.split('+')[1] || 'md5', key)
      hmac.update(s)
      return hmac.digest().toHex()
    } else if (algorithm == 'xor') {
      const buf = new Uint8Array(key.length)
      for (let i = 0; i < buf.length; i++)
        buf[i] = key[i].charCodeAt(0) ^ s[i].charCodeAt(0)
      return decodeLatin1(buf)
    }
    throw 'unsupported digest algorithm'
  }
  $findModifier(modifiers) {
    /*
    {
      "shift": [
        ["Shift_L", 0],
        ["Shift_R", 0]
      ],
      "lock": [
        ["Caps_Lock", 0]
      ],
      "control": [
        ["Control_L", 0],
        ["Control_R", 0]
      ],
      "mod1": [
        ["Meta_L", 1],
        ["Meta_R", 1],
        ["Alt_L", 1],
        [0, "Meta_L"]
      ],
      "mod2": [
        ["Num_Lock", 0]
      ],
      "mod3": [
        ["Super_L", 0],
        ["Super_R", 0],
        ["Super_L", 1]
      ],
      "mod4": [
        ["Hyper_L", 1],
        ["Hyper_R", 0]
      ],
      "mod5": [
        ["ISO_Level3_Shift", 0]
      ]
    }
    */
    for (const modifier in modifiers) {
      for (const t of modifiers[modifier]) {
        for (const key of t) {
          switch (key) {
            case 'Num_Lock':
              this.x11NumLock = modifier
              break
            case 'Alt_L':
              this.x11Alt = modifier
              break
            case 'Control_L':
              this.x11Ctrl = modifier
              break
            case 'Meta_L':
              this.x11Meta = modifier
              break
            case 'Mode_switch':
            case 'ISO_Level3_Shift':
              this.x11AltGr = modifier
              break
          }
        }
      }
    }
  }
  /**
   * Suspend windows
   * @param {Array} wndIds window id list
   */
  suspend(wndIds) {
    if (this.connected)
      this.protocol.send(['suspend', true, wndIds.map(t => Number(t))])
  }
  /**
   * Resume windows
   * @param {Array} wndIds window id list
   */
  resume(wndIds) {
    if (this.connected)
      this.protocol.send(['resume', true, wndIds.map(t => Number(t))])
  }
  /**
   * Refresh window
   * @param {Number} wndId the window id to refresh. -1 for all.
   */
  refreshWnd(wndId = -1) {
    if (this.serverCaps['readonly'] || !this.connected)
      return
    this.protocol.send(['buffer-refresh', Number(wndId), 0, 100, {
        'refresh-now': true,
        'batch': { reset: true },
      }, {
        /* Client properties */
      },
    ])
  }
  $createWnd(wndId, x, y, w, h, metadata, props, overrideRedirect) {
    // To control window placement or to add decoration,
    // a window manager often needs to intercept (redirect)
    // any map or configure request. Pop-up windows, however,
    // often need to be mapped without a window manager
    // getting in the way.
    // The override-redirect flag specifies whether map
    // and configure requests on this window should override
    // a SubstructureRedirectMask on the parent.
    // You can set the override-redirect flag to True or
    // False (default). Window managers use this information
    // to avoid tampering with pop-up windows.
    // https://x.org/releases/current/doc/libX11/libX11/libX11.html#Override_Redirect_Flag

    if (x == 0 && y <= 0 && !metadata["set-initial-position"]) {
      // Find a good position for it
    }
    const wnd = {x, y, w, h, metadata, props, overrideRedirect}
    if (overrideRedirect) {
      // Override-redirect windows are relative positioned.
    } else {
      this.$repositionWnd(wnd)
      this.protocol.send(['map-window', Number(wndId), wnd.x, wnd.y, wnd.w, wnd.h, props])
    }
    this.onWndCreate(wndId, wnd)
  }
  /**
   * Close window
   * @param {Number} wndId window id
   */
  closeWnd(wndId) {
    if (this.serverCaps['readonly'] || !this.connected)
      return
    this.protocol.send(['close-window', Number(wndId)]) // trigger onWndClose
  }
  /**
   * Move window
   * @param {Number} wndId window id
   * @param {Number} x
   * @param {Number} y
   * @param {Number} w
   * @param {Number} h
   * @param {Object} props Client properties
   */
  moveWnd(wndId, x, y, w, h, props) {
    if (this.serverCaps['readonly'] || !this.connected)
      return
    this.protocol.send(['configure-window', Number(wndId), x, y, w, h,
      toPlainObject(props), 0, {}, false/* ignorePosition */])
  }
  $repositionWnd(wnd) {
    let x = wnd.x, y = wnd.y
    if (wnd.x + wnd.w > this.containerDom.clientWidth)
      x = this.containerDom.clientWidth - wnd.w
    wnd.x = x < 0 ? 0 : x
    if (wnd.y + wnd.h > this.containerDom.clientHeight)
      y = this.containerDom.clientHeight - wnd.h
    wnd.y = y < 0 ? 0 : y
    return x != wnd.x || y != wnd.y
  }
  /**
   * Update window position to fit the screen size
   * @param {Number} wndId window id
   * @param {Object} wnd
   */
  repositionWnd(wndId, wnd) {
    if (this.$repositionWnd(wnd)) {
      this.moveWnd(wndId, wnd.x, wnd.y, wnd.w, wnd.h, wnd.props)
      console.log('reposition wndId', wndId, 'to x', wnd.x, 'y', wnd.y)
    }
  }
  /**
   * Popup a notification
   * @param {String} summary
   * @param {String} body
   * @param {String} icon Base64 encoded url
   * @param {Function} onclose
   * @param {Function} onclick
   */
  notify(summary, body, icon = null, onclose = null, onclick = null) {
    if (this.notificationAllow) {
      const n = new Notification(summary, {
        body: body,
        icon: icon,
      })
      if (onclose) n.onclose = onclose
      if (onclick) n.onclick = onclick
    } else {
      console.info('🔔', summary, body)
    }
  }
}

export default {
  "platform": $platform,
  "browser": $browser,
  XpraClient,
  VERSION,
}
