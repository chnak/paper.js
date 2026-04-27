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

// Node.js emulation layer of browser environment, based on jsdom with node-
// canvas integration.

var path = require('path');
// Determine the name by which name the module was required (either 'paper',
// 'paper-jsdom' or 'paper-jsdom-canvas'), and use this to determine if error
// exceptions should be thrown or if loading should fail silently.
var parent = module.parent && module.parent.parent,
    requireName = parent && path.basename(path.dirname(parent.filename));
requireName = /^paper/.test(requireName) ? requireName : 'paper';

var jsdom,
    self;

try {
    jsdom = require('jsdom');
} catch(e) {
    // Check the required module's name to see if it contains jsdom, and only
    // complain about its lack if the module requires it.
    if (/\bjsdom\b/.test(requireName)) {
        throw new Error('Unable to load jsdom module.');
    }
}

if (jsdom) {
    try {
        // Create our document and window objects through jsdom.
        /* global document:true, window:true */
        var dom = new jsdom.JSDOM('<html><body></body></html>', {
            // Use the current working directory as the document's origin, so
            // requests to local files work correctly with CORS.
            url: 'file://' + process.cwd() + '/',
            resources: 'usable'
        });
        self = dom.window;
        // Get the actual document from window
        var document = self.document;

        // Monkey-patch document.createElement to return @napi-rs/canvas wrapper
        // This ensures ALL canvases created by jsdom use our @napi-rs/canvas
        var originalCreateElement = document.createElement.bind(document);
        var Canvas = require('@napi-rs/canvas').Canvas;
        document.createElement = function(tagName) {
            var el = originalCreateElement(tagName);
            if (tagName === 'canvas') {
                // Attach @napi-rs/canvas as _canvas
                el._canvas = new Canvas(1, 1);
                // Store original getContext to wrap it
                var originalGetContext = el.getContext.bind(el);
                el.getContext = function(contextType) {
                    return el._canvas.getContext(contextType);
                };
                // Add @napi-rs/canvas methods
                el.toBuffer = function() {
                    return el._canvas.toBuffer.apply(el._canvas, arguments);
                };
                el.pngStream = function() {
                    return el._canvas.pngStream.apply(el._canvas, arguments);
                };
                el.jpegStream = function() {
                    return el._canvas.jpegStream.apply(el._canvas, arguments);
                };
                // type property
                Object.defineProperty(el, 'type', {
                    get: function() { return el._canvas.type || 'image'; },
                    set: function(t) { el._canvas.type = t; }
                });
            }
            return el;
        };

        require('./canvas.js')(self, requireName);
        require('./xml.js')(self);
    } catch(innerError) {
        // jsdom loaded but failed during initialization (e.g. parse5 version conflict)
        // Fall back to minimal self with @napi-rs/canvas directly
        if (/\bjsdom\b/.test(requireName)) {
            throw new Error('Unable to initialize jsdom: ' + innerError.message);
        }
        var Canvas = require('@napi-rs/canvas').Canvas;
        var minimalDocument = {
            createElement: function(tagName) {
                if (tagName === 'canvas') {
                    var nativeCanvas = new Canvas(1, 1);
                    var wrapper = {
                        width: 1,
                        height: 1,
                        _canvas: nativeCanvas,
                        getContext: function(contextType) {
                            return nativeCanvas.getContext(contextType);
                        },
                        toBuffer: function() {
                            return nativeCanvas.toBuffer.apply(nativeCanvas, arguments);
                        },
                        type: 'image'
                    };
                    return wrapper;
                }
                return { style: {} };
            }
        };
        self = {
            navigator: {
                userAgent: 'Node.js (' + process.platform + '; U; rv:' +
                        process.version + ')'
            },
            document: minimalDocument,
            window: null
        };
        self.window = self; // window points to self for paper-full.js destructuring
    }
} else {
    self = {
        navigator: {
            userAgent: 'Node.js (' + process.platform + '; U; rv:' +
                    process.version + ')'
        }
    };
}

module.exports = self;
