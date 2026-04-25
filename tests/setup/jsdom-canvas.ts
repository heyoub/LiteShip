if (typeof HTMLCanvasElement !== 'undefined') {
  const default2DContext = {
    clearRect() {},
    fillRect() {},
    getImageData() {
      return {
        data: new Uint8ClampedArray(),
      };
    },
    putImageData() {},
    createImageData(width = 0, height = 0) {
      return {
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
      };
    },
    setTransform() {},
    drawImage() {},
    save() {},
    fillText() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    stroke() {},
    translate() {},
    scale() {},
    rotate() {},
    arc() {},
    fill() {},
    measureText() {
      return {
        width: 0,
      };
    },
    transform() {},
    rect() {},
    clip() {},
    fillStyle: '#000000',
    strokeStyle: '#000000',
  };

  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value(contextId: string) {
      if (contextId === '2d') {
        return default2DContext;
      }

      return null;
    },
  });
}
