/*
 * Copyright (c) 2022 Garen Fang <fungaren@qq.com>
 * -------------- The file has been tested on Xpra server version v4.3.2 ---------------
 * -------------------- and may not work on previous version -------------------------
 */
const utf8encoder = new TextEncoder('utf-8')
// TextEncoder No longer support non-utf-8 encoding:
// https://developer.mozilla.org/zh-CN/docs/Web/API/TextEncoder/TextEncoder

const utf8decoder = new TextDecoder('utf-8')
const utf16decoder = new TextDecoder('utf-16')

export function decodeUTF8(buf) {
  return utf8decoder.decode(buf)
}
export function encodeUTF8(str) {
  return utf8encoder.encode(str)
}
export function decodeUTF16(buf) {
  return utf16decoder.decode(buf)
}
export function encodeUTF16(str) {
  // https://developer.mozilla.org/en-US/docs/Web/API/DOMString/Binary
  const u16 = Array.from(str).map(t => t.charCodeAt(0))
  return new Uint8Array(Uint16Array.from(u16).buffer)
}
export function decodeLatin1(buf) {
  // WARNING: 128, 129, ... 159 will be encoded to non-latin1 characters:
  // new TextDecoder('latin1').decode(new Uint8Array([128])).charCodeAt(0)
  // output: 8364 (UTF-16 "€")
  // But String.fromCharCode(128) => \u0080 is good
  let s = ''
  for (const t of buf)
    s += String.fromCharCode(t)
  return s
}
export function encodeLatin1(str) {
  const u16 = Array.from(str).map(t => t.charCodeAt(0))
  // Good news: 0, ..., 127; 160, 161, ..., 255 are totally compatible with utf-16:
  // new TextDecoder('latin1').decode(new Uint8Array([255])).charCodeAt(0)
  // output: 255 (latin1/UTF-16 "ÿ")
  // values greater than 255 will get truncated to 1 byte:
  // UTF-16 "€" (0x20ac) => latin1 "¬" (0xac)
  return Uint8Array.from(u16)
}

export function toHex(buf) {
  return buf.reduce((prev, curr) => (prev + (curr < 0x10 ? '0' : '') + curr.toString(16)), '')
}
export function fromHex(str) {
  let r = new Uint8Array(str.length / 2)
  for (let i = 0; i < r.length; i++) {
    r[i] = parseInt(str[i*2] + str[i*2+1], 16)
  }
  return r
}
export function toBase64(buf) {
  // https://developer.mozilla.org/en-US/docs/Web/API/btoa
  return btoa(decodeLatin1(buf))
}
export function fromBase64(str) {
  return encodeLatin1(atob(str))
}

export function WriteUint8(buf, value, offset = 0) {
  buf[offset] = value
}
export function WriteInt8(buf, value, offset = 0) {
  buf[offset] = value < 0 ? value + 0x100 : value
}
export function WriteUint16BE(buf, value, offset = 0) {
  buf[offset] = (value & 0xff00) >> 8
  buf[offset+1] = value & 0xff
}
export function WriteInt16BE(buf, value, offset = 0) {
  WriteUint16BE(buf, value < 0 ? value + 0x10000 : value, offset)
}
export function WriteUint32BE(buf, value, offset = 0) {
  buf[offset] = (value & 0xff000000) >> 24
  buf[offset+1] = (value & 0xff0000) >> 16
  buf[offset+2] = (value & 0xff00) >> 8
  buf[offset+3] = value & 0xff
}
export function WriteInt32BE(buf, value, offset = 0) {
  WriteUint32BE(buf, value < 0 ? value + 0x100000000 : value, offset)
}
export function WriteInt64BE(buf, value, offset = 0) {
  // BigInt is not supported by some browser, workaround:
  // (Javascript only support bit operation for 32-bit integer)
  WriteInt32BE(buf, value / 0x100000000, offset)
  WriteUint32BE(buf, value >>> 0, offset + 4)
}

export function ReadUint8(buf, offset = 0) {
  return buf[offset]
}
export function ReadInt8(buf, offset = 0) {
  const v = buf[offset]
  return v >= 0x80 ? v - 0x100 : v
}
export function ReadUint16BE(buf, offset = 0) {
  return (buf[offset] << 8) | buf[offset+1]
}
export function ReadInt16BE(buf, offset = 0) {
  const v = ReadUint16BE(buf, offset)
  return v >= 0x8000 ? v - 0x10000 : v
}
export function ReadInt32BE(buf, offset = 0) {
  // NOTICE: This is 32-bit signed integer!
  return (buf[offset] << 24) | (buf[offset+1] << 16) | (buf[offset+2] << 8) | buf[offset+3]
}
export function ReadUint32BE(buf, offset = 0) {
  // Convert to 32-bit unsigned integer!
  return ReadInt32BE(buf, offset) >>> 0
}
export function ReadInt64BE(buf, offset = 0) {
  // BigInt is not supported by some browser, workaround:
  // (Javascript only support bit operation for 32bit integer)
  let high32 = ReadInt32BE(buf, offset) * 0x100000000
  let low32 = ReadUint32BE(buf, offset + 4)
  return high32 + low32
}

export function WriteUTF8(buf, str, offset = 0) {
  buf.set(encodeUTF8(str), offset)
}
export function WriteLatin1(buf, str, offset = 0) {
  buf.set(encodeLatin1(str), offset)
}
