/*
 * Copyright (c) 2022 Garen Fang <fungaren@qq.com>
 * -------------- The file has been tested on Xpra server version v4.3.2 ---------------
 * -------------------- and may not work on previous version -------------------------
 *
 * Copyright (C) 2021 Tijs van der Zwaan <tijzwa@vpo.nl>
 * Copyright (c) 2021 Antoine Martin <antoine@xpra.org>
 * Licensed under MPL 2.0, see:
 * http://www.mozilla.org/MPL/2.0/
 *
 * This file is part of Xpra.
 */
import {toBase64} from './buffer'
import {createBitmapFromCompressedRgb} from './rgb_decoder'

function $commonCodecs(available, available2) {
  let r = []
  for (const t of available) {
    if (available2.indexOf(t) >= 0)
      r.push(t)
  }
  return r
}

function $bestCodec(available, preferred) {
  let best = null
  let bestIdx = 99999
  for (const t of available) {
    const idx = preferred.indexOf(t)
    if (idx >= 0 && idx < bestIdx) {
      best = t
      bestIdx = idx
    }
  }
  return best || available[0]
}

/**
 * Create BitmapImage from image buffer
 * @param {Uint8Array} data
 * @param {String} mime
 * @returns Promise that resolves with an ImageBitmap object.
 */
async function createBitmapFromBuffer(data, mime = 'image/jpeg') {
  return new Promise((resolve) => {
    // https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement
    const img = new Image()
    img.onload = () => {
      // https://developer.mozilla.org/en-US/docs/Web/API/ImageBitmap
      createImageBitmap(img, {
        colorSpaceConversion: "none",
      }).then(bmp => {
        resolve(bmp)
        // NOTICE: close the bitmap when no longer needed:
        // bmp.close()
      })
    }
    img.src = `data:${mime};base64,${toBase64(data)}`
  })
}

class XpraDecoderWorkerHost {
  worker = null
  // MSE*Decoders are not supported in Web Worker
  audioDecoder = null
  windows = {}
  callbacks = {}

  /**
   * Init Web Worker and MSEAudioDecoder
   * @param {Array} serverAudioCodecs Array of server supported codecs
   */
  constructor(serverAudioCodecs) {
    // https://webpack.js.org/guides/web-workers/
    this.worker = new Worker(new URL('./decoder_worker.js', import.meta.url))
    // Receive message from the Web Worker
    this.worker.onmessage = (e) => {
      e = e.data
      switch (e.cmd) {
        case 'painted':
          {
            const cb = this.callbacks[e.seqId]
            if (cb) {
              cb(e.text)
              delete this.callbacks[e.seqId]
            }
          }
          break
        case 'error':
          console.error(e.text)
          this.close()
          break
        default:
          break
      }
    }

    // Get the best codec for both client and server
    const bestCodec = $bestCodec(
      $commonCodecs(MSEAudioDecoder.supportedCodecs(), serverAudioCodecs),
      [
        'opus+mka', 'vorbis+mka', 'opus+ogg', 'vorbis+ogg', 'flac+ogg',
        'aac+mpeg4', 'mp3+mpeg4', 'mp3', 'flac', 'wav',
      ]
    )
    this.audioDecoder = new MSEAudioDecoder(
      MSEAudioDecoder.codecs[bestCodec], console.error)
  }
  /**
   * Add an window to the decoder
   * @param {Number} wndId
   * @param {Canvas} canvas
   * @param {Array} serverVideoCodecs
   */
  addWnd(wndId, canvas, serverVideoCodecs) {
    if (!this.worker)
      throw 'the worker is broken'
    if (wndId in this.windows)
      throw 'wndId ' + wndId + ' already exists'

    this.windows[wndId] = { canvas }
    if ('VideoDecoder' in window) {
      const offscreenCanvas = canvas.transferControlToOffscreen()
      this.worker.postMessage({
        cmd: 'addWnd',
        wndId,
        offscreenCanvas,
      }, [offscreenCanvas])
    } else {
      // Get the best codec for both client and server
      const bestCodec = $bestCodec(
        $commonCodecs(MSEVideoDecoder.supportedCodecs(), serverVideoCodecs),
        [ 'vp8+webm', 'h264+mpeg4', 'vp9+webm', 'av1+mpeg4' ]
      )
      this.windows[wndId].video = new MSEVideoDecoder(
        MSEVideoDecoder.codecs[bestCodec], canvas.parentElement,
        canvas.width, canvas.height, console.error)
    }
    console.log('window', wndId, 'added to decoder')
  }
  /**
   * Remove an window from the decoder
   * @param {Number} wndId
   */
  removeWnd(wndId) {
    if (!this.worker)
      throw 'the worker is broken'
    if (!(wndId in this.windows))
      throw 'wndId ' + wndId + ' does not exist'

    if ('VideoDecoder' in window) {
      this.worker.postMessage({
        cmd: 'removeWnd',
        wndId,
      })
    } else {
      const wnd = this.windows[wndId]
      wnd.video.close()
      delete this.windows[wndId]
    }
    console.log('window', wndId, 'removed from decoder')
  }
  /**
   * Draw bitmap or video
   * @param {Number} wndId
   * @param {Number} x
   * @param {Number} y
   * @param {Number} srcWidth
   * @param {Number} srcHeight
   * @param {String} encoding
   * @param {Uint8Array} data
   * @param {Number} seqId
   * @param {Number} rowStride
   * @param {Object} options
   * @param {Function} cb
   */
  draw(wndId, x, y, srcWidth, srcHeight, encoding, data, seqId, rowStride, options, cb) {
    if (!this.worker)
      throw 'the worker is broken'
    if (!('VideoDecoder' in window) && !(wndId in this.windows))
      throw 'wndId ' + wndId + ' does not exist'

    const wnd = this.windows[wndId]
    if (!('VideoDecoder' in window) && encoding == 'h264') {
      wnd.video.decode(data)
      cb() // TODO: invoke the callback when decodes finished.
      return
    }
    if (!('VideoDecoder' in window) && encoding == 'scroll') {
      const ctx = wnd.canvas.getContext("2d")
      let n = data.length
      for (const t of data) {
        const x = t[0]
        const y = t[1]
        const w = t[2]
        const h = t[3]
        const xDelta = t[4]
        const yDelta = t[5]
        ctx.drawImage(wnd.canvas, x, y, w, h, x + xDelta, y + yDelta, w, h)
        if (--n == 0)
          cb()
      }
      return
    }
    const isBitmap = ['jpeg','png','png/P','png/L','webp','avif'].indexOf(encoding) >= 0
    if (!('ImageDecoder' in window) && isBitmap) {
      const mime = 'image/' + encoding.split('/')[0]
      createBitmapFromBuffer(data, mime).then(bmp => {
        const ctx = wnd.canvas.getContext("2d")
        ctx.clearRect(x, y, bmp.width, bmp.height)
        ctx.drawImage(bmp, x, y)
        bmp.close()
        cb()
      }).catch(console.error)
      return
    }
    const isRGB = ['rgb','rgb32','rgb24'].indexOf(encoding) >= 0
    if (!('VideoDecoder' in window) && isRGB) {
      createBitmapFromCompressedRgb(
        data, srcWidth, srcHeight, encoding, rowStride, options,
      ).then(bmp => {
        const ctx = wnd.canvas.getContext("2d")
        ctx.clearRect(x, y, bmp.width, bmp.height)
        ctx.drawImage(bmp, x, y)
        bmp.close()
        cb()
      }).catch(console.error)
      return
    }

    this.callbacks[seqId] = cb

    let transfer = []
    if (data.constructor.name == 'Uint8Array')
      transfer.push(data.buffer)

    this.worker.postMessage({
      cmd: 'draw',
      wndId,
      x,
      y,
      srcWidth,
      srcHeight,
      encoding,
      data,
      seqId,
      rowStride,
      options,
    }, transfer)
  }
  /**
   * Play sound
   * @param {String} codec
   * @param {Uint8Array} data
   * @param {Object} options
   * @param {Object} metadata
   */
  sound(codec, data, options, metadata) {
    if (!this.worker)
      throw 'the worker is broken'

    if (codec != this.audioDecoder.codec) {
      console.error('server send sound data codec', codec,
        'but expect', this.audioDecoder.codec)
      this.close()
      return
    }

    if (options['start-of-stream'])
      console.log('start-of-stream')
    else if (options['end-of-stream']) {
      this.audioDecoder.close()
      this.audioDecoder = null
    } else if (metadata) {
      this.audioDecoder.decode(metadata)
      this.audioDecoder.decode(data)
    } else
      this.audioDecoder.decode(data)
  }
  /**
   * Resize the HTMLVideoElement
   * @param {Number} wndId
   * @param {Number} w
   * @param {Number} h
   */
  resize(wndId, w, h) {
    const wnd = this.windows[wndId]
    if (!wnd) {
      console.error('wndId', wndId, 'does not exist')
      return
    }
    const dom = wnd?.video?.video
    if (!dom) // It do not use MSEVideoDecoder
      return
    dom.width = w
    dom.height = h
  }
  /**
   * Close the Web Worker
   */
  close() {
    if (!this.worker)
      throw 'the worker is broken'

    this.audioDecoder.close()
    this.audioDecoder = null
    for (const wndId in this.windows) {
      this.windows[wndId].video?.close()
    }
    this.windows = {}
    this.callback = {} // maybe call the callbacks inside?

    this.worker.postMessage({
      cmd: 'close', // terminate Web Worker
    })
    this.worker = null
  }
}

class MSEVideoDecoder {
  mime = ''
  containerDom = null
  onError = null

  mediaSource = null
  sourceBuffer = null
  video = null

  // As the decoder can only decode a piece of data once a time,
  // if too much data come, put them here.
  bufferQueue = []
  outputResolver = null
  outputRejector = null

  static get available() {
    return ('MediaSource' in window)
  }

  // https://www.w3.org/TR/webcodecs-codec-registry/#video-codec-registry
  // https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Video_codecs
  // https://developer.mozilla.org/en-US/docs/Web/Media/Formats/codecs_parameter
  static codecs = {
    "h264+mpeg4": 'video/mp4; codecs="avc1.42C01E"',

    "vp8+webm": 'video/webm; codecs="vp8"',
    "vp8+ogg": 'video/ogg; codecs="vp8"',

    "vp9+webm": 'video/webm; codecs="vp9"',
    "vp9+ogg": 'video/ogg; codecs="vp9"',

    "av1+mpeg4": 'video/mp4; codecs="av01"',
    "av1+webm": 'video/webm; codecs="av01"',
  }
  /**
   * Get supported codecs by user's browser
   * @param {Array} blacklist Blacklist of codecs for the browser
   * @returns An array with supported codecs
   */
  static supportedCodecs(blacklist = []) {
    let r = []
    for (const k in MSEVideoDecoder.codecs) {
      if (MediaSource.isTypeSupported(MSEVideoDecoder.codecs[k])) {
        if (blacklist.indexOf(k) >= 0)
          console.info(k, 'is supported by your browser but blacklisted')
        else {
          console.log(k, 'is supported by your browser')
          r.push(k)
        }
      } else
        console.info(k, 'is not supported by your browser')
    }
    return r
  }
  /**
   * Constructor
   * @param {String} mime MIME
   * @param {HTMLElement} containerDom Container for the HTMLVideoElement
   * @param {Number} width
   * @param {Number} height
   * @param {Function} onError Callback
   */
  constructor(mime, containerDom, width, height, onError) {
    if (!MSEVideoDecoder.available)
      throw 'your browser does not support MediaSource'
    if (!MediaSource.isTypeSupported(mime))
      throw 'unsupported mime: ' + mime

    this.mime = mime
    this.containerDom = containerDom
    this.onError = onError

    // https://developer.mozilla.org/en-US/docs/Web/API/MediaSource
    this.mediaSource = new MediaSource()
    this.mediaSource.onsourceopen = () => {
      URL.revokeObjectURL(this.video.src)
      try {
        // https://developer.mozilla.org/en-US/docs/Web/API/SourceBuffer
        this.sourceBuffer = this.mediaSource.addSourceBuffer(this.mime)
      } catch (e) {
        this.mediaSource = null
        this.containerDom.removeChild(this.video)
        this.video = null
        this.onError(e)
        return
      }
      this.sourceBuffer.mode = 'sequence'
      this.sourceBuffer.onupdateend = () => this.$appendBuffer()
    }
    // https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement
    this.video = document.createElement('video')
    this.video.setAttribute('autoplay', true)
    this.video.setAttribute('width', width)
    this.video.setAttribute('height', height)
    this.video.oncanplay = () => {
      this.video.play()
    }
    this.video.onerror = () => {
      const e = this.video.error
      this.close()
      this.onError(e)
    }
    this.video.src = URL.createObjectURL(this.mediaSource)
    this.containerDom.appendChild(this.video)
  }
  /**
   * Append buffer to the sourceBuffer
   */
  async $appendBuffer() {
    const e = this.video.error
    if (e) {
      this.close()
      this.onError(e)
      return
    }

    let buffer = null
    if (this.bufferQueue.length > 0)
      buffer = this.bufferQueue.shift()
    else {
      try {
        buffer = await new Promise((r,j) => {
          this.outputResolver = r
          this.outputRejector = j
        })
      } catch {
        return // Terminated
      }
    }
    this.sourceBuffer.appendBuffer(buffer)
  }
  /**
   * Decode the buffer
   * @param {Uint8Array} data buffer
   */
  decode(data) {
    if (!this.mediaSource)
      throw 'the decoder is broken'

    const SEGMENT_SIZE = 1024 * 1024
    for (let offset = 0; offset < data.length;) {
      const end = offset + SEGMENT_SIZE < data.length ? offset + SEGMENT_SIZE : data.length
      // Use slice() instead of subarray() to slice the underlying buffer
      const buffer = data.slice(offset, end).buffer
      offset = end

      // Someone is waiting for it
      if (this.outputResolver) {
        let r = this.outputResolver
        this.outputResolver = null
        r(buffer)
      } else
        this.bufferQueue.push(buffer)
    }
  }
  /**
   * Close the decoder
   */
  close() {
    if (!this.mediaSource)
      throw 'the decoder is broken'

    if (this.mediaSource.readyState == 'open')
      this.mediaSource.endOfStream()

    if (this.outputResolver)
      this.outputRejector()

    this.mediaSource.removeSourceBuffer(this.sourceBuffer)
    this.mediaSource = null
    this.sourceBuffer = null
    this.containerDom.removeChild(this.video)
    this.video = null
  }
}

class MSEAudioDecoder {
  mime = ''
  onError = null

  mediaSource = null
  sourceBuffer = null
  audio = null

  // As the decoder can only decode a piece of data once a time,
  // if too much data come, put them here.
  bufferQueue = []
  outputResolver = null
  outputRejector = null

  static get available() {
    return ('MediaSource' in window)
  }

  // https://www.w3.org/TR/webcodecs-codec-registry/#audio-codec-registry
  // https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Audio_codecs
  // https://developer.mozilla.org/en-US/docs/Web/Media/Formats/codecs_parameter
  static codecs = {
    "aac+mpeg4": 'audio/mp4; codecs="mp4a.40.2"',
    "aac": "audio/aac",

    "flac+mpeg4": 'audio/mp4; codecs="flac"',
    "flac+ogg": 'audio/ogg; codecs="flac"',
    "flac": 'audio/flac',

    "pcm": 'audio/wav; codecs="pcm-s16"',
    "wav": "audio/wav",

    "mp3+mpeg4": 'audio/mp4; codecs="mp3"',
    "mp3": "audio/mp3",

    "opus+mpeg4": 'audio/mp4; codecs="opus"',
    "opus+mka": 'audio/webm; codecs="opus"',
    "opus+ogg": 'audio/ogg; codecs="opus"',

    "vorbis+mka": 'audio/webm; codecs="vorbis"',
    "vorbis+ogg": 'audio/ogg; codecs="vorbis"',
  }
  /**
   * Get supported codecs by user's browser
   * @param {Array} blacklist Blacklist of codecs for the browser
   * @returns An array with supported codecs
   */
  static supportedCodecs(blacklist = []) {
    // Some codecs crashes the web browser or other reasons make them usable.
    /*
    switch (browser) {
      case 'firefox':
        blacklist = blacklist.concat([ 'opus+mka', 'vorbis+mka' ])
        break
      case 'safari':
        blacklist = blacklist.concat([ 'opus+mka', 'vorbis+mka', 'wav' ])
        break
      case 'chrome':
        blacklist = blacklist.concat([ 'aac+mpeg4' ])
        if (platform == 'macos')
          blacklist = blacklist.concat([ 'opus+mka' ])
        break
      default:
        blacklist = blacklist.concat([ 'opus+mka', 'vorbis+mka', 'wav', 'aac+mpeg4' ])
        break
    }
    */
    let r = []
    for (const k in MSEAudioDecoder.codecs) {
      if (MediaSource.isTypeSupported(MSEAudioDecoder.codecs[k])) {
        if (blacklist.indexOf(k) >= 0)
          console.info(k, 'is supported by your browser but blacklisted')
        else {
          console.log(k, 'is supported by your browser')
          r.push(k)
        }
      } else
        console.info(k, 'is not supported by your browser')
    }
    return r
  }
  /**
   * Constructor
   * @param {String} mime MIME
   * @param {Function} onError Callback
   */
  constructor(mime, onError) {
    if (!MSEAudioDecoder.available)
      throw 'your browser does not support MediaSource'
    if (!MediaSource.isTypeSupported(mime))
      throw 'unsupported mime: ' + mime

    this.mime = mime
    this.onError = onError

    // https://developer.mozilla.org/en-US/docs/Web/API/MediaSource
    this.mediaSource = new MediaSource()
    this.mediaSource.onsourceopen = () => {
      URL.revokeObjectURL(this.audio.src)
      try {
        // https://developer.mozilla.org/en-US/docs/Web/API/SourceBuffer
        this.sourceBuffer = this.mediaSource.addSourceBuffer(this.mime)
      } catch (e) {
        this.mediaSource = null
        document.body.removeChild(this.audio)
        this.audio = null
        this.onError(e)
        return
      }
      this.sourceBuffer.mode = 'sequence'
      this.sourceBuffer.onupdateend = () => this.$appendBuffer()
    }
    // https://developer.mozilla.org/en-US/docs/Web/API/HTMLAudioElement
    this.audio = document.createElement('audio')
    this.audio.setAttribute('autoplay', true)
    this.audio.oncanplay = () => {
      this.audio.play()
    }
    this.audio.onerror = () => {
      if (this.audio) {
        const e = this.audio.error
        this.close()
        this.onError(e)
      }
    }
    this.audio.src = URL.createObjectURL(this.mediaSource)
    document.body.appendChild(this.audio)
  }
  /**
   * Append buffer to the sourceBuffer
   */
  async $appendBuffer() {
    const e = this.audio.error
    if (e) {
      this.close()
      this.onError(e)
      return
    }

    let buffer = null
    if (this.bufferQueue.length > 0)
      buffer = this.bufferQueue.shift()
    else {
      try {
        buffer = await new Promise((r,j) => {
          this.outputResolver = r
          this.outputRejector = j
        })
      } catch {
        return // Terminated
      }
    }
    this.sourceBuffer.appendBuffer(buffer)
  }
  /**
   * Decode the buffer
   * @param {Uint8Array} data buffer
   */
  decode(data) {
    if (!this.mediaSource)
      throw 'the decoder is broken'

    const SEGMENT_SIZE = 1024 * 1024
    for (let offset = 0; offset < data.length;) {
      const end = offset + SEGMENT_SIZE < data.length ? offset + SEGMENT_SIZE : data.length
      // Use slice() instead of subarray() to slice the underlying buffer
      const buffer = data.slice(offset, end).buffer
      offset = end

      // Someone is waiting for it
      if (this.outputResolver) {
        let r = this.outputResolver
        this.outputResolver = null
        r(buffer)
      } else
        this.bufferQueue.push(buffer)
    }
  }
  /**
   * Close the decoder
   */
  close() {
    if (!this.mediaSource)
      throw 'the decoder is broken'

    if (this.mediaSource.readyState == 'open')
      this.mediaSource.endOfStream()

    if (this.outputResolver)
      this.outputRejector()

    this.mediaSource.removeSourceBuffer(this.sourceBuffer)
    this.mediaSource = null
    this.sourceBuffer = null
    document.body.removeChild(this.audio)
    this.audio = null
  }
}

export {
  XpraDecoderWorkerHost,
  MSEAudioDecoder,
}
