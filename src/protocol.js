/*
 * Copyright (c) 2022 Garen Fang <fungaren@qq.com>
 * -------------- The file has been tested on Xpra server version v4.3.2 ---------------
 * -------------------- and may not work on previous version -------------------------
 *
 * Copyright (c) 2013-2019 Antoine Martin <antoine@xpra.org>
 * Copyright (c) 2016 David Brushinski <dbrushinski@spikes.com>
 * Copyright (c) 2014 Joshua Higgins <josh@kxes.net>
 * Copyright (c) 2015 Spikes, Inc.
 * Portions based on websock.js by Joel Martin
 * Copyright (C) 2012 Joel Martin
 *
 * Licensed under MPL 2.0
 *
 * xpra wire protocol with worker support
 */
export default class XpraProtocolWorkerHost {
  worker = null
  handler = null

  constructor(cb) {
    this.handler = cb
  }
  open(url) {
    if (this.worker) {
      // Reuse the existing worker
      this.worker.postMessage({
        cmd: 'open',
        url,
      })
      return
    }
    // https://webpack.js.org/guides/web-workers/
    this.worker = new Worker(new URL('./protocol_worker.js', import.meta.url))
    // Receive message from the Web Worker
    this.worker.onmessage = (e) => {
      e = e.data
      switch (e.cmd) {
        case 'ready': // The Web Worker is ready
          this.worker.postMessage({
            cmd: 'open',
            url,
          })
          break
        case 'process': // The Web Worker want to handle a packet
          this.handler(e.packet)
          break
        case 'log': // The Web Worker want to print debug message
          console.log(e.text)
          break
        default:
          console.error('unsupported message form Web Worker')
          break
      }
    }
  }
  close() {
    this.worker.postMessage({
      cmd: 'close', // close connection
    })
    // The host may reconnect later.
  }
  terminate() {
    this.close()
    this.worker.postMessage({
      cmd: 'terminate', // terminate Web Worker
    })
    this.worker = null
  }
  send(obj) {
    this.worker.postMessage({
      cmd: 'send', // send packet
      packet: obj,
    })
  }
  cipherIn(caps, key) {
    this.worker.postMessage({
      cmd: 'cipher_in',
      caps: caps,
      key: key,
    })
  }
  cipherOut(caps, key) {
    this.worker.postMessage({
      cmd: 'cipher_out',
      caps: caps,
      key: key,
    })
  }
}
