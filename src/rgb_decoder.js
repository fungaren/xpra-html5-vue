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
import { inflate } from 'zlib'
import lz4 from './lz4'

/**
 * Create an ImageBitmap from pixel buffer
 * @param {Uint8Array} data
 * @param {Number} width
 * @param {Number} height
 * @param {String} encoding
 * @param {Number} rowStride
 * @returns Promise that resolves with an ImageBitmap object.
 */
export async function createBitmapFromRgb(data, width, height, encoding, rowStride) {
  return new Promise((resolve, reject) => {
    if (data.length != rowStride * height)
      throw 'data length mismatch to the width/height'

    let imageData = null
    // https://developer.mozilla.org/zh-CN/docs/Web/API/ImageData
    switch (encoding) {
      case 'rgb':
      case 'rgb32':
        if (rowStride == width * 4)
          imageData = new ImageData(new Uint8ClampedArray(data), width, height)
        else {
          // There are paddings (rowStride > width*4), never mind :)
          imageData = new ImageData(new Uint8ClampedArray(data), Math.floor(rowStride / 4), height)
        }
        // Crop the image to its actual size, so paddings are cropped!
        createImageBitmap(imageData, 0, 0, width, height, {
          colorSpaceConversion: "none",
        }).then(img => {
          resolve(img)
          // NOTICE: close the bitmap when no longer needed:
          // bmp.close()
        })
        break
      case 'rgb24':
        {
          // ImageData only support RGBA channel. It seems the conversion is inevitable.
          let pixels = new Uint8Array(width * height * 4)
          for (let i = 0, j = 0, row = 0, padding_pos = width * 3; i < data.length;) {
            if (i == padding_pos) {
              i = ++row * rowStride // Skip paddings
              padding_pos = row * width * 3
            }
            pixels[j++] = data[i++]
            pixels[j++] = data[i++]
            pixels[j++] = data[i++]
            pixels[j++] = 0xff
          }
          imageData = new ImageData(new Uint8ClampedArray(pixels), width, height)
          createImageBitmap(imageData, 0, 0, width, height, {
            colorSpaceConversion: "none",
          }).then(img => {
            resolve(img)
            // NOTICE: close the bitmap when no longer needed:
            // bmp.close()
          })
        }
        break
      default:
        reject('unsupported rgb encoding')
    }
  })
}
/**
 * Decompress Pixel buffer and create an ImageBitmap
 * @param {Uint8Array} data
 * @param {Number} width
 * @param {Number} height
 * @param {String} encoding
 * @param {Number} rowStride
 * @param {Object} options
 * @returns Promise that resolves with an ImageBitmap object.
 */
export async function createBitmapFromCompressedRgb(data, width, height, encoding, rowStride, options) {
  return new Promise((resolve, reject) => {
    if (options.lz4) {
      createBitmapFromRgb(
        lz4.decode(data), width, height, encoding, rowStride)
        .then(resolve).catch(reject)
    } else if (options.zlib) {
      inflate(data, (err, result) => {
        if (err) {
          reject(err)
          return
        }
        createBitmapFromRgb(
          result, width, height, encoding, rowStride)
          .then(resolve).catch(reject)
      })
    } else
      createBitmapFromRgb(
        data, width, height, encoding, rowStride)
        .then(resolve).catch(reject)
  })
}
