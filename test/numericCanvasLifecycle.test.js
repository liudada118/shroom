const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const source = fs.readFileSync(path.resolve(__dirname, '../client/src/components/three/NumThreeColorV3.js'), 'utf8')
const mounting = source.match(/^function mountNumericCanvasLayers\([^]*?^}/m)
assert.ok(mounting, 'production numeric canvas mounting function exists')

// Small DOM implementation exercises the real ownership code without creating GPU contexts.
class Element {
  constructor(tagName) {
    this.tagName = tagName
    this.childNodes = []
    this.parentNode = null
    this.className = ''
    this.style = {}
    this.classList = {
      add: (...classes) => { this.className = [...new Set([...this.className.split(' ').filter(Boolean), ...classes])].join(' ') },
    }
  }

  appendChild(child) {
    child.remove()
    this.childNodes.push(child)
    child.parentNode = this
    return child
  }

  remove() {
    if (!this.parentNode) return
    const siblings = this.parentNode.childNodes
    siblings.splice(siblings.indexOf(this), 1)
    this.parentNode = null
  }

  querySelector(selector) {
    for (const child of this.childNodes) {
      if (child.className.split(' ').includes(selector.slice(1))) return child
      const found = child.querySelector(selector)
      if (found) return found
    }
    return null
  }
}

function fixture() {
  const document = { createElement: tagName => new Element(tagName) }
  const context = vm.createContext({ document })
  vm.runInContext(mounting[0], context)
  return { document, mount: context.mountNumericCanvasLayers }
}

test('a ruler or magnifier left in the host cannot prevent the current renderer from attaching', () => {
  const { document, mount } = fixture()
  const host = document.createElement('div')
  const inner = host.appendChild(document.createElement('div'))
  inner.className = 'canvasNumInner'
  const ruler = inner.appendChild(document.createElement('canvas'))
  ruler.className = 'canvasThree canvasRuler'
  const magnifier = inner.appendChild(document.createElement('canvas'))
  magnifier.className = 'canvasMagnifier'
  const renderer = document.createElement('canvas')
  const layers = mount(host, renderer, 360)
  assert.equal(renderer.parentNode, inner)
  assert.equal(renderer.style.zIndex, '1')
  assert.equal(ruler.style.zIndex, '2')
  assert.equal(inner.childNodes.length, 3)
  assert.equal(inner.querySelector('.canvasRuler'), ruler)
  assert.equal(layers.magnifier, magnifier)
  assert.equal(ruler.width, 360)
  assert.equal(ruler.height, 360)
  layers.dispose()
  assert.equal(host.childNodes.length, 0)
})

test('repeated setup and cleanup leave one live renderer with overlays and no detached residue', () => {
  const { document, mount } = fixture()
  const host = document.createElement('div')
  for (let cycle = 0; cycle < 6; cycle++) {
    const renderer = document.createElement('canvas')
    const layers = mount(host, renderer, 360 + cycle)
    const inner = host.querySelector('.canvasNumInner')
    assert.equal(inner.parentNode, host)
    assert.equal(renderer.parentNode, inner)
    assert.equal(inner.childNodes.length, 3)
    assert.equal(layers.magnifier.parentNode, inner)
    assert.equal(inner.style.width, `${360 + cycle}px`)
    // Three's renderer cleanup already removes its canvas before owned DOM cleanup.
    renderer.remove()
    layers.dispose()
    layers.dispose()
    assert.equal(host.childNodes.length, 0)
    assert.equal(layers.magnifier.parentNode, null)
  }
})

test('each numeric host owns only its own canvases and leaves unrelated DOM intact', () => {
  const { document, mount } = fixture()
  const first = document.createElement('div')
  const second = document.createElement('div')
  const firstRenderer = document.createElement('canvas')
  const secondRenderer = document.createElement('canvas')
  const firstLayers = mount(first, firstRenderer, 360)
  const secondLayers = mount(second, secondRenderer, 480)
  const firstInner = first.querySelector('.canvasNumInner')
  const unrelated = firstInner.appendChild(document.createElement('span'))
  firstLayers.dispose()
  assert.equal(firstInner.childNodes.length, 1)
  assert.equal(unrelated.parentNode, firstInner)
  assert.equal(secondRenderer.parentNode, second.querySelector('.canvasNumInner'))
  assert.equal(second.querySelector('.canvasNumInner').childNodes.length, 3)
  secondLayers.dispose()
  assert.equal(second.childNodes.length, 0)
})
