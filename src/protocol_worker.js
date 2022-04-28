/*
 * Copyright (c) 2022 Garen Fang <fungaren@qq.com>
 * -------------- The file has been tested on Xpra server version v4.3.2 ---------------
 * -------------------- and may not work on previous version -------------------------
 *
 * Copyright (C) 2012 Joel Martin
 * Licensed under MPL 2.0
 *
 * xpra wire protocol with worker support
 */
import {WriteUint32BE, WriteLatin1, decodeLatin1, encodeLatin1, toHex} from './buffer'
import lz4 from './lz4'
import forge from 'node-forge'
import {inflateSync, brotliDecompressSync} from 'zlib'
import {rencoder, rdecoder} from './rencode'

function eventStr(event) {
  if (!event.code)
    return "unknown reason (no websocket error code)"

  const d = {
    '1000': 'Normal Closure',
    '1001': 'Going Away',
    '1002': 'Protocol Error',
    '1003': 'Unsupported Data',
    '1004': '(For future)',
    '1005': 'No Status Received',
    '1006': 'Abnormal Closure',
    '1007': 'Invalid frame payload data',
    '1008': 'Policy Violation',
    '1009': 'Message too big',
    '1010': 'Missing Extension',
    '1011': 'Internal Error',
    '1012': 'Service Restart',
    '1013': 'Try Again Later',
    '1014': 'Bad Gateway',
    '1015': 'TLS Handshake',
  }
  return `"${d[event.code] || '?'}" (${event.code}): "${event.reason || '?'}"`
}

function setupCipher(caps, key, cb) {
  if (!key)
    throw "encryption key is required"

  if (caps['cipher'] != 'AES')
    throw "unsupported encryption algorithm: " + caps['cipher']

  const iv = caps['cipher.iv']
  if (!iv)
    throw "IV is required"

  const iterations = caps['cipher.key_stretch_iterations']
  if (iterations < 0)
    throw "invalid number of iterations: " + iterations

  const keyStretch = (caps['cipher.key_stretch'] || "PBKDF2").toUpperCase()
  if (keyStretch != "PBKDF2")
    throw "invalid key stretching function: " + keyStretch

  const keySize = caps['cipher.key_size'] || 32
  if ([32, 24, 16].indexOf(keySize) < 0)
    throw "invalid key size: " + keySize

  let keySalt = caps['cipher.key_salt']
  if (typeof keySalt != 'string')
    keySalt = decodeLatin1(keySalt)

  const keyHash = (caps['cipher.key_hash'] || 'sha1').toLowerCase()
  const secret = forge.pkcs5.pbkdf2(key, keySalt, iterations, keySize, keyHash)

  const mode = (caps['cipher.mode'] || 'CBC').toUpperCase()
  let blockSize = 0
  switch (mode) {
    case 'CBC':
      blockSize = 32
      break
    case 'CFB':
    case 'CTR':
      // Does not require the plain text be padded to the block size of the cipher.
      break
    default:
      throw "unsupported AES mode: " + mode
  }

  cb(caps['cipher'] + '-' + mode, blockSize, secret, iv)
}

/**
 * The main Xpra wire protocol
 */
class XpraProtocol {
  websocket = null
  timeout = 0 // Connection timeout
  // monitor = 0 // Queue monitor interval
  rQ = [] // Receive queue
  sQ = [] // Send queue
  mQ = [] // Worker message queue
  header = [] // Buffer of packet header
  rawPackets = {}

  decryptor = null
  decryptorBlockSize = null
  encryptor = null
  encryptorBlockSize = null

  /**
   * Open websocket connection
   * @param {String} url Websocket URL
   */
  open(url) {
    if (this.websocket)
      throw 'the websocket has already opened'

    this.timeout = setTimeout(() => {
      postMessage({
        cmd: 'process',
        packet: [ 'error', "connection timed out", 0 ],
      })
      this.timeout = 0
    }, 15000)

    try {
      this.websocket = new WebSocket(url, 'binary')
      this.websocket.binaryType = 'arraybuffer'
      this.websocket.onopen = () => {
        if (this.timeout) {
          clearTimeout(this.timeout)
          this.timeout = 0
        }
        // this.monitor = setInterval(() => {
        //   console.log('rQ:', this.rQ.length, 'sQ:', this.sQ.length, 'mQ:', this.mQ.length)
        // }, 5000)
        postMessage({
          cmd: 'process',
          packet: [ 'opened' ],
        })
      }
      this.websocket.onclose = (e) => {
        if (this.timeout) {
          clearTimeout(this.timeout)
          this.timeout = 0
        }
        postMessage({
          cmd: 'process',
          packet: [ 'closed', eventStr(e) ],
        })
      }
      this.websocket.onerror = (e) => {
        if (this.timeout) {
          clearTimeout(this.timeout)
          this.timeout = 0
        }
        postMessage({
          cmd: 'process',
          packet: [ 'error', eventStr(e), e.code || 0 ],
        })
      }
      this.websocket.onmessage = (e) => {
        this.rQ.push(new Uint8Array(e.data))
        setTimeout(() => this.$processReceiveQueue(), 0)
      }
    }
    catch (e) {
      if (this.timeout) {
        clearTimeout(this.timeout)
        this.timeout = 0
      }
      postMessage({
        cmd: 'process',
        packet: [ 'error', '' + e, 0 ],
      })
    }
  }
  close() {
    if (!this.websocket)
      return
    // Stop processing packets and events:
    this.websocket.onopen = null
    this.websocket.onclose = null
    this.websocket.onerror = null
    this.websocket.onmessage = null
    this.websocket.close()
    this.websocket = null
    this.rQ = []
    this.sQ = []
    this.mQ = []
    this.header = []
    this.rawPackets = {}
    // clearInterval(this.monitor)
  }
  $protocolError(msg) {
    console.error("protocol error:", msg)
    this.close()
    // Notify closed (it may still try to re-connect):
    postMessage({
      cmd: 'process',
      packet: [ 'closed', msg ],
    })
  }
  $processMessageQueue() {
    while (this.mQ.length > 0) {
      const obj = this.mQ.shift()
      if (!obj) return

      // https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage
      // https://developer.mozilla.org/en-US/docs/Web/API/DedicatedWorkerGlobalScope/postMessage
      // https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm
      // Transfer the ownership of buffer to eliminate buffer copy
      let transfer = []
      switch (obj[0]) {
        case 'draw':
          if (obj[7].constructor.name == 'Uint8Array')
            transfer.push(obj[7].buffer)
          break
        case 'sound-data':
          if (obj[2].constructor.name == 'Uint8Array')
            transfer.push(obj[2].buffer)
          break
      }
      try {
        // Notify the Worker Host to process the packet
        postMessage({
          cmd: 'process',
          packet: obj,
        }, transfer)
      } catch(e) {
        console.error(e, obj)
      }
    }
  }
  $processReceiveQueue() {
    while (this.rQ.length > 0 && this.websocket) {
      if (this.header.length < 8 && this.rQ.length > 0) {
        // We need 8 bytes to continue. If no enough data, then retrieve from the receive queue:
        while (this.header.length < 8 && this.rQ.length > 0) {
          const item = this.rQ[0]
          const needed = 8-this.header.length
          if (item.length > needed) {
            this.header = this.header.concat(Array.from(item.subarray(0, needed)))
            // Replace the item with what is left over
            this.rQ[0] = item.subarray(needed)
          }
          else {
            this.header = this.header.concat(Array.from(item))
            // The item has been consumed
            this.rQ.shift()
          }
        }

        // Verify the header format:
        if (this.header[0] !== "P".charCodeAt(0)) {
          const hex = toHex(Uint8Array.from(this.header))
          this.$protocolError("invalid packet header format: (hex) " + hex)
          return
        }
      }
      if (this.header.length < 8) {
        // We need more data to continue
        return
      }

      /**
       * 0   8   16  24   32
       * +---+---+---+---+
       * | P | F | L | I |
       * +---+---+---+---+
       * |  PayloadSize  |
       * +---------------+
       * |    Payload    |
       * +---------------+
       *   Header Format
       *
       * P: Magic
       * F: Flags
       * L: Compression Level
       * I: Packet Index
       *
       * +---+---+---+---+---+---+---+---+
       * | 0 | 0 | 0 | P | U | 0 | E | L |
       * +---+---+---+---+---+---+---+---+
       *              Flags
       *
       * - L: rdecodelegacy
       * - E: Encrypted
       * - U: Unused
       * - P: rdecodeplus
       */
      const flags = this.header[1]
      if (flags & ~(0x01 | 0x02 | 0x08 | 0x10)) {
        this.$protocolError("unsupported protocol flag: 0x" + flags.toString(16))
        return
      }
      const level = this.header[2]
      if (level & 0x20) {
        this.$protocolError("lzo compression is not supported")
        return
      }
      const index = this.header[3]
      if (index >= 20) {
        this.$protocolError("invalid packet index: " + index)
        return
      }
      if (!(flags & 0x10) && index == 0) {
        this.$protocolError("the packet is neither encoded by rencodeplus, nor a raw packet")
        return
      }

      let payload_size = (this.header[4] << 24) | (this.header[5] << 16) |
        (this.header[6] << 8) | this.header[7]

      let padding_size = 0
      if ((flags & 0x02) && this.decryptorBlockSize > 0) {
        padding_size = this.decryptorBlockSize - payload_size % this.decryptorBlockSize
        // The payload_size does not include the padding_size,
        // but padding bytes are contained in the payload
        payload_size += padding_size
      }

      // Verify that we have enough data for the full payload
      let recv_size = 0
      for (const t of this.rQ) {
        recv_size += t.length
      }
      if (payload_size > recv_size)
        return

      // Done parsing the header, the next packet will need a new one
      this.header = []

      // Compose the packet data from receive queue
      let payload = new Uint8Array(payload_size)
      for (let i = 0; i < payload_size; ) {
        const item = this.rQ[0]
        const needed = payload_size - i
        if (item.length > needed) {
          payload.set(item.subarray(0, needed), i)
          i += needed
          // Replace the item with what is left over
          this.rQ[0] = item.subarray(needed)
        } else {
          payload.set(item, i)
          i += item.length
          // The item has been consumed
          this.rQ.shift()
        }
      }

      // Decrypt if needed
      if (flags & 0x02) {
        this.decryptor.update(forge.util.createBuffer(decodeLatin1(payload), 'raw'))
        const decrypted = this.decryptor.output.getBytes()
        if (!decrypted) {
          console.error("error decrypting packet using", this.decryptor)
          this.rawPackets = {}
          continue
        }
        // Decrypted data length should equal to the actual size
        if (decrypted.length != payload_size - padding_size) {
          console.error("expected", payload_size - padding_size, "bytes, but got", decrypted.length)
          this.rawPackets = {}
          continue
        }
        // Remove padding
        payload = encodeLatin1(decrypted).subarray(0, payload_size)
      }

      // Decompress it if needed
      if (level & 0x10)
        payload = lz4.decode(payload)
      else if (level & 0x40)
        payload = brotliDecompressSync(payload)
      else if (level != 0)
        payload = inflateSync(payload)

      if (index > 0) {
        this.rawPackets[index] = payload
        if (Object.keys(this.rawPackets).length >= 4) {
          this.$protocolError("too many raw packets: " + Object.keys(this.rawPackets).length)
          this.rawPackets = {}
          return
        }
        continue
      }

      // Decode raw packet string into object.
      let obj = null
      try {
        if (flags & 0x10)
          obj = rdecoder.decode(payload)
        else
          throw 'unsupported encoding' // bencode, rencodelegacy is removed
      } catch (e) {
        console.error(e, "packet:", obj)
        this.$protocolError("error decoding packet")
        this.rawPackets = {}
        return
      }

      /**
       * Copy rawPackets into obj[1...N]
       * The object is a map containing:
       * 0: Command/Event
       * 1: (Optional) Raw packet 1
       * ...
       * N: (Optional) Raw packet N
       */
      obj = Object.assign(obj, this.rawPackets)
      this.rawPackets = []

      this.mQ.push(obj)
      setTimeout(() => this.$processMessageQueue(), 0)
    }
  }
  $processSendQueue() {
    while (this.sQ.length > 0 && this.websocket) {
      const obj = this.sQ.shift()
      if (!obj) return

      /* switch (obj[0]) {
        case 'ping_echo':
        case 'damage-sequence':
        case 'pointer-position':
          break
        case 'button-action': // Any packets you cared about
        case 'configure-window':
          console.log('send packet:', ...obj)
          break
      } */

      let payload = null
      try {
        payload = rencoder.encode(obj)
      } catch(e) {
        console.error(e, "failed to encode object", obj)
        continue
      }

      let flags = 0x10 // only rencodeplus is supported
      const payload_size = payload.length
      // Encryption
      if (this.encryptor) {
        flags |= 0x2

        const padding_size = this.encryptorBlockSize - (payload_size % this.encryptorBlockSize)
        let payload_padded = new Uint8Array(payload_size + padding_size)
        payload_padded.set(payload)
        for (let i = 0; i < padding_size; i++)
          payload_padded[payload_size + i] = padding_size

        this.encryptor.update(forge.util.createBuffer(decodeLatin1(payload_padded)), 'raw')
        let encrypted = this.encryptor.output.getBytes()
        if (!encrypted) {
          console.error('failed to encrypt payload', payload_padded)
          continue
        }
        if (encrypted.length != payload_size + padding_size) {
          console.error('expected', payload_size + padding_size, 'bytes, but got', encrypted.length)
          continue
        }
        payload = new Uint8Array(8 + encrypted.length)
        WriteLatin1(payload, encrypted, 8)
      } else {
        let payload_with_hdr = new Uint8Array(8 + payload_size)
        payload_with_hdr.set(payload, 8)
        payload = payload_with_hdr
      }

      payload[0] = "P".charCodeAt(0)
      payload[1] = flags
      payload[2] = 0 // compression level
      payload[3] = 0 // packet index
      WriteUint32BE(payload, payload_size, 4)

      if (this.websocket)
        this.websocket.send(payload.buffer)
    }
  }
  send(obj) {
    if (!this.websocket)
      throw 'the websocket has not opened'

    this.sQ.push(obj)
    setTimeout(() => this.$processSendQueue(), 0)
  }
  cipherIn(caps, key) {
    setupCipher(caps, key, (cipher, blockSize, secret, iv) => {
      this.decryptorBlockSize = blockSize
      this.decryptor = forge.cipher.createDecipher(cipher, secret)
      this.decryptor.start({ iv })
    })
  }
  cipherOut(caps, key) {
    setupCipher(caps, key, (cipher, blockSize, secret, iv) => {
      this.encryptorBlockSize = blockSize
      this.encryptor = forge.cipher.createCipher(cipher, secret)
      this.encryptor.start({ iv })
    })
  }
}

const p = new XpraProtocol()
onmessage = function(e) {
  e = e.data
  switch (e.cmd) {
    case 'open':
      p.open(e.url)
      break
    case 'close':
      p.close()
      break
    case 'terminate':
      close()
      break
    case 'send':
      p.send(e.packet)
      break
    case 'cipher_in':
      p.cipherIn(e.caps, e.key)
      break
    case 'cipher_out':
      p.cipherOut(e.caps, e.key)
      break
    default:
      postMessage({
        cmd: 'log',
        text: 'unknown command: ' + e.cmd,
      })
      break
  }
}
// Tell the Web Worker Host we are ready
postMessage({cmd: 'ready'})
