/*
 * Paper.js - The Swiss Army Knife of Vector Graphics Scripting.
 * http://paperjs.org/
 *
 * Copyright (c) 2011 - 2020, Jürg Lehni & Jonathan Puckey
 * http://juerglehni.com/ & https://puckey.studio/
 *
 * Distributed under the MIT license. See LICENSE file for details.
 *
 * All rights reserved.
 */

// Add some useful extensions to HTMLCanvasElement:
// - HTMLCanvasElement#type, so we can switch to a PDF canvas
// - Various Node-Canvas methods, routed through from HTMLCanvasElement:
//   toBuffer, pngStream, createPNGStream, jpegStream, createJPEGStream

module.exports = function(self, requireName) {
    var Canvas;
    try {
        Canvas = require('canvas').Canvas;
    } catch(error) {
        // Remove `self.window`, so we still have the global `self` reference,
        // but no `window` object:
        // - On the browser, this corresponds to a worker context.
        // - On Node.js, it basically means the canvas is missing or not working
        //   which can be treated the same way.
        delete self.window;
        // Check the required module's name to see if it contains canvas, and
        // only complain about its lack if the module requires it.
        if (/\bcanvas\b/.test(requireName)) {
            throw new Error('Unable to load canvas module.');
        }
        return;
    }

    var HTMLCanvasElement = self.HTMLCanvasElement || (self.window && self.window.HTMLCanvasElement),
        idlUtils;
    try {
        idlUtils = require('jsdom/lib/jsdom/living/generated/utils');
    } catch(e) {
        // jsdom >= 29 移除了 idlUtils，尝试使用其他方式获取 impl
        idlUtils = null;
    }

    // 获取底层 canvas 的辅助函数
    function getCanvasFromWrapper(wrapper) {
        if (!wrapper) return null;
        // 优先尝试 implForWrapper（旧版 jsdom）
        if (idlUtils) {
            try {
                var impl = idlUtils.implForWrapper(wrapper);
                if (impl && impl._canvas) return impl._canvas;
            } catch(e) {}
        }
        // 新版 jsdom: wrapper 自身就是底层 canvas
        if (wrapper.width && wrapper.height) {
            return wrapper;
        }
        return null;
    }

    // Override width property to sync with underlying @napi-rs/canvas
    var _widthDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
    Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
        get: function() {
            return _widthDescriptor.get.call(this);
        },
        set: function(w) {
            _widthDescriptor.set.call(this, w);
            // Sync to underlying @napi-rs/canvas
            var canvas = getCanvasFromWrapper(this);
            if (canvas) {
                canvas.width = w;
            }
        }
    });

    // Override height property to sync with underlying @napi-rs/canvas
    var _heightDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'height');
    Object.defineProperty(HTMLCanvasElement.prototype, 'height', {
        get: function() {
            return _heightDescriptor.get.call(this);
        },
        set: function(h) {
            _heightDescriptor.set.call(this, h);
            // Sync to underlying @napi-rs/canvas
            var canvas = getCanvasFromWrapper(this);
            if (canvas) {
                canvas.height = h;
            }
        }
    });

    // Add fake HTMLCanvasElement#type property:
    Object.defineProperty(HTMLCanvasElement.prototype, 'type', {
        get: function() {
            var canvas = getCanvasFromWrapper(this);
            return canvas && canvas.type || 'image';
        },

        set: function(type) {
            // Allow replacement of internal node-canvas, so we can switch to a
            // PDF canvas.
            var impl = idlUtils ? idlUtils.implForWrapper(this) : null,
                size = impl && impl._canvas ? impl._canvas : (this._canvas || this);
            var newCanvas = new Canvas(size.width || 1, size.height || 1, type);
            if (impl) {
                impl._canvas = newCanvas;
            }
            this._canvas = newCanvas;
            if (impl) {
                impl._context = null;
            }
        }
    });

    // Extend HTMLCanvasElement with useful methods from the underlying Canvas:
    var methods = ['toBuffer', 'pngStream', 'createPNGStream', 'jpegStream',
        'createJPEGStream'];
    methods.forEach(function(key) {
        HTMLCanvasElement.prototype[key] = function() {
            var canvas = getCanvasFromWrapper(this);
            if (canvas && typeof canvas[key] === 'function') {
                return canvas[key].apply(canvas, arguments);
            }
            throw new Error('Unable to call ' + key + ' on canvas - no underlying canvas found');
        };
    });
};
