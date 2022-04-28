/*
 * Copyright (c) 2022 Garen Fang <fungaren@qq.com>
 * -------------- The file has been tested on Xpra server version v4.3.2 ---------------
 * -------------------- and may not work on previous version -------------------------
 *
 * Copyright (c) 2021 Antoine Martin <antoine@xpra.org>
 */
import {
  encodeUTF8, decodeUTF8, decodeLatin1, WriteUTF8, WriteLatin1,
  WriteInt8, WriteUint8, WriteInt16BE, WriteInt32BE, WriteInt64BE,
  ReadInt8, ReadInt16BE, ReadInt32BE, ReadInt64BE
} from "./buffer"

const RENCODE = {
  DEFAULT_FLOAT_BITS  : 32,
  MAX_INT_LENGTH      : 64,
  CHR_LIST            : 59,
  CHR_DICT            : 60,
  CHR_INT             : 61,
  CHR_INT1            : 62,
  CHR_INT2            : 63,
  CHR_INT4            : 64,
  CHR_INT8            : 65,
  CHR_FLOAT32         : 66,
  CHR_FLOAT64         : 44,
  CHR_TRUE            : 67,
  CHR_FALSE           : 68,
  CHR_NONE            : 69,
  CHR_TERM            : 127,
  INT_POS_FIXED_START : 0,
  INT_POS_FIXED_COUNT : 44,
  INT_NEG_FIXED_START : 70,
  INT_NEG_FIXED_COUNT : 32,
  DICT_FIXED_START    : 102,
  DICT_FIXED_COUNT    : 25,
  STR_FIXED_START     : 128,
  STR_FIXED_COUNT     : 64,
  LIST_FIXED_START    : 128+64, // STR_FIXED_START + STR_FIXED_COUNT,
  LIST_FIXED_COUNT    : 64,
  COLON_CHARCODE      : ":".charCodeAt(0), // for char strings
  SLASH_CHARCODE      : "/".charCodeAt(0), // for byte strings
}

class Rencoder {
  encodeStr(s) {
    let len = encodeUTF8(s).length
    if (len < RENCODE.STR_FIXED_COUNT) {
      let data = new Uint8Array(1 + len)
      WriteUint8(data, RENCODE.STR_FIXED_START + len)
      WriteUTF8(data, s, 1)
      return data
    } else {
      let len_str = '' + len
      let data = new Uint8Array(len_str.length + 1 + len)
      WriteLatin1(data, len_str, 0)
      WriteLatin1(data, ':', len_str.length)
      WriteUTF8(data, s, len_str.length + 1)
      return data
    }
  }
  encodeInt(i) {
    let data = null
    if (i >= 0 && i < RENCODE.INT_POS_FIXED_COUNT) {
      data = new Uint8Array(1)
      WriteUint8(data, RENCODE.INT_POS_FIXED_START + i)
    } else if (i >= -RENCODE.INT_NEG_FIXED_COUNT && i < 0) {
      data = new Uint8Array(1)
      WriteInt8(data, RENCODE.INT_NEG_FIXED_START - 1 - i)
    } else if (i >= -0x80 && i < 0x80) {
      data = new Uint8Array(2)
      WriteUint8(data, RENCODE.CHR_INT1)
      WriteInt8(data, i, 1)
    } else if (i >= -0x8000 && i < 0x8000) {
      data = new Uint8Array(3)
      WriteUint8(data, RENCODE.CHR_INT2)
      WriteInt16BE(data, i, 1)
    } else if (i >= -0x80000000 && i < 0x80000000) {
      data = new Uint8Array(5)
      WriteUint8(data, RENCODE.CHR_INT4)
      WriteInt32BE(data, i, 1)
    } else if (-0x8000000000000000 <= i && i < 0x8000000000000000) {
      data = new Uint8Array(9)
      WriteUint8(data, RENCODE.CHR_INT8)
      WriteInt64BE(data, i, 1)
    } else {
      // Variable length integer
      let s = '' + i
      if (s.length >= RENCODE.MAX_INT_LENGTH)
        throw "number too big: " + i

      data = new Uint8Array(1 + s.length + 1)
      WriteUint8(data, RENCODE.CHR_INT)
      WriteLatin1(data, s, 1)
      WriteUint8(data, RENCODE.CHR_TERM, 1 + s.length)
    }
    return data
  }
  encodeBytes(b) {
    let len_str = '' + b.length
    let data = new Uint8Array(len_str.length + 1 + b.length)
    WriteLatin1(data, len_str, 0)
    WriteLatin1(data, '/', len_str.length)
    WriteLatin1(data, b, len_str.length + 1)
    return data
  }
  encodeList(l) {
    let total_size = 1
    let data_list = []
    if (l.length < RENCODE.LIST_FIXED_COUNT) {
      let data = new Uint8Array(1)
      WriteUint8(data, RENCODE.LIST_FIXED_START + l.length)
      data_list.push(data)

      for (const t of l) {
        data = this.encode(t)
        data_list.push(data)
        total_size += data.length
      }
    } else {
      let data = new Uint8Array(1)
      WriteUint8(data, RENCODE.CHR_LIST)
      data_list.push(data)

      for (const t of l) {
        data = this.encode(t)
        data_list.push(data)
        total_size += data.length
      }

      data = new Uint8Array(1)
      WriteUint8(data, RENCODE.CHR_TERM)
      data_list.push(data)
      total_size += 1
    }
    // NOTICE: this operation may take too much memory
    let data = new Uint8Array(total_size)
    let offset = 0
    for (const t of data_list) {
      data.set(t, offset)
      offset += t.length
    }
    return data
  }
  encodeDict(d) {
    let total_size = 1
    let data_list = []
    if (Object.keys(d).length < RENCODE.DICT_FIXED_COUNT) {
      let data = new Uint8Array(1)
      WriteUint8(data, RENCODE.DICT_FIXED_START + Object.keys(d).length)
      data_list.push(data)

      for (const k in d) {
        data = this.encode(k)
        data_list.push(data)
        total_size += data.length

        data = this.encode(d[k])
        data_list.push(data)
        total_size += data.length
      }
    } else {
      let data = new Uint8Array(1)
      WriteUint8(data, RENCODE.CHR_DICT)
      data_list.push(data)

      for (const k in d) {
        data = this.encode(k)
        data_list.push(data)
        total_size += data.length

        data = this.encode(d[k])
        data_list.push(data)
        total_size += data.length
      }

      data = new Uint8Array(1)
      WriteUint8(data, RENCODE.CHR_TERM)
      data_list.push(data)
      total_size += 1
    }
    // NOTICE: this operation may take too much memory
    let data = new Uint8Array(total_size)
    let offset = 0
    for (const t of data_list) {
      data.set(t, offset)
      offset += t.length
    }
    return data
  }
  encodeBool(b) {
    let data = new Uint8Array(1)
    WriteUint8(data, b ? RENCODE.CHR_TRUE : RENCODE.CHR_FALSE)
    return data
  }
  encodeNone() {
    let data = new Uint8Array(1)
    WriteUint8(data, RENCODE.CHR_NONE)
    return data
  }
  encode(obj) {
    switch (typeof(obj)) {
      case 'object':
        if (obj == null)
          return this.encodeNone()
        switch (obj.constructor.name) {
          case 'Array':
            return this.encodeList(obj)
          case 'Object':
            return this.encodeDict(obj)
          case 'Uint8Array':
            return this.encodeBytes(obj)
          case 'ArrayBuffer':
            console.warn('received an ArrayBuffer, should be Uint8Array')
            return this.encodeBytes(new Uint8Array(obj))
          default:
            throw 'unsupported object type: ' + obj.constructor.name
        }
      case 'undefined':
        return this.encodeNone()
      case 'string':
        return this.encodeStr(obj)
      case 'number':
        return this.encodeInt(obj)
      case 'boolean':
        return this.encodeBool(obj)
      default:
        throw 'unsupported data type: ' + typeof(obj)
    }
  }
}
class Rdecoder {
  decoder = null
  constructor() {
    const decoder = {}
    decoder['0'.charCodeAt(0)] = this.decodeStrOrBytes
    decoder['1'.charCodeAt(0)] = this.decodeStrOrBytes
    decoder['2'.charCodeAt(0)] = this.decodeStrOrBytes
    decoder['3'.charCodeAt(0)] = this.decodeStrOrBytes
    decoder['4'.charCodeAt(0)] = this.decodeStrOrBytes
    decoder['5'.charCodeAt(0)] = this.decodeStrOrBytes
    decoder['6'.charCodeAt(0)] = this.decodeStrOrBytes
    decoder['7'.charCodeAt(0)] = this.decodeStrOrBytes
    decoder['8'.charCodeAt(0)] = this.decodeStrOrBytes
    decoder['9'.charCodeAt(0)] = this.decodeStrOrBytes
    decoder[RENCODE.CHR_INT] = this.decodeInt
    decoder[RENCODE.CHR_INT1] = this.decodeInt8
    decoder[RENCODE.CHR_INT2] = this.decodeInt16
    decoder[RENCODE.CHR_INT4] = this.decodeInt32
    decoder[RENCODE.CHR_INT8] = this.decodeInt64
    decoder[RENCODE.CHR_LIST] = this.decodeList
    decoder[RENCODE.CHR_DICT] = this.decodeDict
    decoder[RENCODE.CHR_TRUE] = v => (v.$offset += 1, true)
    decoder[RENCODE.CHR_FALSE] = v => (v.$offset += 1, false)
    decoder[RENCODE.CHR_NONE] = v => (v.$offset += 1, null)

    for (let i = 0; i < RENCODE.STR_FIXED_COUNT; i++) {
      decoder[RENCODE.STR_FIXED_START + i] = (v) => {
        v.$offset += 1
        let s = decodeUTF8(v.subarray(v.$offset, v.$offset + i))
        v.$offset += i
        return s
      }
    }
    for (let i = 0; i < RENCODE.INT_POS_FIXED_COUNT; i++) {
      decoder[RENCODE.INT_POS_FIXED_START + i] = (v) => {
        v.$offset += 1
        return i
      }
    }
    for (let i = 0; i < RENCODE.INT_NEG_FIXED_COUNT; i++) {
      decoder[RENCODE.INT_NEG_FIXED_START + i] = (v) => {
        v.$offset += 1
        return - 1 - i
      }
    }
    for (let i = 0; i < RENCODE.LIST_FIXED_COUNT; i++) {
      decoder[RENCODE.LIST_FIXED_START + i] = (v) => {
        v.$offset += 1
        let l = []
        for (let j = 0; j < i; j++)
          l.push(this.decode(v))
        return l
      }
    }
    for (let i = 0; i < RENCODE.DICT_FIXED_COUNT; i++) {
      decoder[RENCODE.DICT_FIXED_START + i] = (v) => {
        v.$offset += 1
        let d = {}
        for (let j = 0; j < i; j++) {
          let k = this.decode(v)
          d[k] = this.decode(v)
        }
        return d
      }
    }
    this.decoder = decoder
  }
  decodeStrOrBytes(v) {
    for (let i = v.$offset; i < v.length; i++) {
      if (v[i] == RENCODE.COLON_CHARCODE) {
        let str_len = Number(decodeLatin1(v.subarray(v.$offset, i)))
        if (isNaN(str_len))
          throw 'invalid string length: ' + str_len

        let s = decodeUTF8(v.subarray(i + 1, i + 1 + str_len))
        v.$offset = i + 1 + str_len
        return s
      } else if (v[i] == RENCODE.SLASH_CHARCODE) {
        let bytes_len = Number(decodeLatin1(v.subarray(v.$offset, i)))
        if (isNaN(bytes_len))
          throw 'invalid bytes length: ' + bytes_len
        // Use slice() instead of subarray() because of the
        // underlying buffer may be collected
        let s = v.slice(i + 1, i + 1 + bytes_len)
        v.$offset = i + 1 + bytes_len
        return s
      }
    }
    throw 'invalid string/bytes'
  }
  decodeInt(v) {
    v.$offset += 1
    for (let i = v.$offset; i < v.length; i++) {
      if (v[i] == RENCODE.CHR_TERM) {
        let num = Number(decodeLatin1(v.subarray(v.$offset, i)))
        if (isNaN(num))
          throw 'invalid number'
        v.$offset = i + 1
        return num
      }
    }
  }
  decodeInt8(v) {
    v.$offset += 1
    let num = ReadInt8(v, v.$offset)
    v.$offset += 1
    return num
  }
  decodeInt16(v) {
    v.$offset += 1
    let num = ReadInt16BE(v, v.$offset)
    v.$offset += 2
    return num
  }
  decodeInt32(v) {
    v.$offset += 1
    let num = ReadInt32BE(v, v.$offset)
    v.$offset += 4
    return num
  }
  decodeInt64(v) {
    v.$offset += 1
    let num = ReadInt64BE(v, v.$offset)
    v.$offset += 8
    return num
  }
  decodeList(v) {
    v.$offset += 1
    let l = []
    while (v[v.$offset] != RENCODE.CHR_TERM)
      l.push(this.decode(v))
    v.$offset += 1
    return l
  }
  decodeDict(v) {
    v.$offset += 1
    let d = {}
    while (v[v.$offset] != RENCODE.CHR_TERM) {
      let k = this.decode(v)
      d[k] = this.decode(v)
    }
    v.$offset += 1
    return d
  }
  decode(data) {
    if (typeof(data) != 'object' || data.constructor.name != 'Uint8Array')
      throw 'unsupported data type'
    if (!('$offset' in data))
      data.$offset = 0

    if (data.$offset >= data.length)
      throw 'reached end of buffer view'

    let fn = this.decoder[data[data.$offset]]
    if (!fn)
      throw 'no decoder for type ' + data[data.$offset] + ' at offset ' + data.$offset
    return fn.call(this, data)
  }
}

export const rencoder = new Rencoder()
export const rdecoder = new Rdecoder()

function match(input, output) {
  let a, b
  a = b = null
  try {
    a = rencoder.encode(input)
  } catch (e) {
    console.error('encoder error', e)
    throw e
  }
  if (a.length != output.length) {
    console.error('length mismatch', a, output)
    throw ''
  }
  for (let i = 0; i < output.length; i++) {
    if (output[i] != a[i]) {
      console.error('result mismatch', a, output)
      throw ''
    }
  }

  try {
    b = rdecoder.decode(output)
  } catch (e) {
    console.error('decoder error', e)
    throw e
  }
  if (b != input) {
    console.error('result mismatch', b, input)
    throw ''
  }
}

match(true, Uint8Array.from([67]))
match(false, Uint8Array.from([68]))
match(-10, Uint8Array.from([79]))
match(-29, Uint8Array.from([98]))
match(1, Uint8Array.from([1]))
match(40, Uint8Array.from([40]))
match('foobarbaz', Uint8Array.from([137, 102, 111, 111, 98, 97, 114, 98, 97, 122]))
// We don't handle float
// match(1234.56, Uint8Array.from([66, 68, 154, 81, 236]))
match(100, Uint8Array.from([62, 100]))
match(-100, Uint8Array.from([62, 156]))
match(7483648, Uint8Array.from([64, 0, 114, 49, 0]))
match(-7483648, Uint8Array.from([64, 255, 141, 207, 0]))
match(8223372036854775808, Uint8Array.from([65, 114, 31, 73, 76, 88, 156, 0, 0]))
match(-8223372036854775808, Uint8Array.from([65, 141, 224, 182, 179, 167, 100, 0, 0]))
match(27123, Uint8Array.from([63, 105, 243]))
match(-27123, Uint8Array.from([63, 150, 13]))
match('\x00', Uint8Array.from([129, 0]))
match("fööbar", Uint8Array.from([136, 102, 195, 182, 195, 182, 98, 97, 114]))
console.log('rencode self-test passed')
