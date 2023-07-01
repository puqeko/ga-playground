import { EditorView, basicSetup } from 'codemirror'
import { foldState } from '@codemirror/language'
import { javascript } from '@codemirror/lang-javascript'
import { ViewPlugin } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import * as StackTrace from 'stacktrace-js'
import { SourceMapConsumer } from 'source-map'

import * as Algebra from '../libs/ganja.js/ganja'
import mappingsDataUrl from 'data-url:../libs/source-map/mappings.wasm'

import { transpile } from './transpile'
import { DblClickDetector, DragDetector, WaitTillUndisturbedFor } from './util'

let isMapConsumerReady = false
// https://github.com/parcel-bundler/parcel/issues/4405
fetch(mappingsDataUrl)
  .then(r => r.arrayBuffer())
  .then(b => {
    SourceMapConsumer.initialize({ 'lib/mappings.wasm': b })
    if (b instanceof ArrayBuffer) isMapConsumerReady = true
  })

const view = document.getElementById('view')
let editor

const saveState = () => { // cache
  const json = JSON.stringify(editor.state.toJSON({ foldState }))
  localStorage.setItem('ga-cm-state', json)
  console.info('saved')
}

/// /////////////////////////////////////////
/// Script execution

export class ContextManager {
  constructor () {
    this._contexts = []
    this._dead = []
  }

  clear () {
    this._contexts = []
    this._dead = []
  }

  getAlgebra () { return this._contexts.at(-1) }

  pushAlgebra (...args) {
    // Ensure no duplicates of algebras for interoperability
    const a = Algebra(...args)
    let existing = this._contexts.find((x) => `${x.basis}` === `${a.basis}`)
    if (!existing) existing = this._dead.find((x) => `${x.basis}` === `${a.basis}`)
    if (!existing) existing = a
    this._contexts.push(existing) // reference same object again if possible
    return this._contexts.at(-1)
  }

  popAlgebra () {
    this._dead.push(this._contexts.pop())
    return this._contexts.at(-1)
  }

  map (name, ...args) {
    const a = this.getAlgebra()
    if (!a) throw Error('Must be in an Algebra context to use special syntax')
    return a[name](...args)
  }
}

const outputEl = document.getElementById('output')
const clearOutput = () => { outputEl.textContent = '' }
const getOutput = () => outputEl.textContent
const setOutput = (s) => { outputEl.textContent = s }
const clearView = () => { view.innerHTML = '' }
const print = (s, end = '\n') => { outputEl.textContent += `${s}` + end }

// Edit declearations and context to determine default behaviour and avaliable variables/functions
const cm = new ContextManager()
const graph = (...args) => {
  const g = cm.getAlgebra()?.graph(...args)
  view.appendChild(g)
  g.style.width = g.style.height = ''
  return g
}

const context = { print, graph, context_manager: cm, _$: cm.map.bind(cm) } // expose these variables in script
const declerations = `\
//# sourceURL=script.js
const{${Object.keys(context).join(',')}}=this;
context_manager.pushAlgebra(2,0,1);\n` // default to 2D pga, must have trailing newline

const resolveHangCheckAndSave = () => {
  try {
    saveState() // could fail if cache disabled, or cm does weird stuff
    localStorage.setItem('ga-maybe-hung', 'false') // could fail if cache disabled
  } catch (e) { console.warn(e) }
}
const cancelHangCheckTimeout = () => {
  if (hangCheckTimeout) {
    clearTimeout(hangCheckTimeout)
    hangCheckTimeout = null
    try { localStorage.setItem('ga-maybe-hung', 'false') } catch (e) { console.warn(e) } // could fail if cache disabled
  }
}

// In case we leave the page during the wait time, we don't want it to look like the page hung
// Note: this doesn't trigger a save
let hangCheckTimeout
window.addEventListener('beforeunload', e => { cancelHangCheckTimeout() })

// Count number of lines
const countNl = (s) => [...s.matchAll(/\n/g)].length
// Measure number of lines needed for function decleration and other declerations added to source
const SOURCE_OFFSET = countNl((new Function('$')).toString().split('$')[0]) + countNl(declerations) /* eslint-disable-line no-new-func */
const withSourceLocation = (e, map, fn) => {
  // Get position in source file accounting for ast transformations and other added lines
  StackTrace.fromError(e).then(frames => {
    const { lineNumber, columnNumber } = frames.at(0)
    if (!map || !isMapConsumerReady) {
      fn(e, lineNumber - SOURCE_OFFSET, columnNumber)
      return
    }
    SourceMapConsumer.with(map, null, consumer => {
      const { line, column } = consumer.originalPositionFor({ line: lineNumber - SOURCE_OFFSET, column: columnNumber })
      fn(e, line, column)
    })
  })
}

let prev
const run = (opts = { force: false }) => {
  const outputText = getOutput()
  setOutput('...')
  cancelHangCheckTimeout() // if we are able to run then we didn't hang last time
  // Cancel hang check since we have been able to restart so things must be fine
  let didError = false
  const result = transpile(editor?.state?.doc?.toString() ?? '', e => {
    clearOutput()
    prev = null // ensure we rerun next time
    print(`SyntaxError: ${e.description}`)
    if (e.lineNumber) print(`On line ${e.lineNumber}`, '')
    if (e.column) print(` at column ${e.column}`)
    didError = true
  })
  if (didError) return // handled already
  const codeStr = result?.code
  if (!codeStr?.trim()) { setOutput('Nothing to run'); return }
  if (!opts?.force && prev === codeStr) { setOutput(outputText); return } // don't run again unless forced
  prev = codeStr
  // if this can execute after x seconds (the main thread isn't blocked) then safe code to save
  let fn
  try { fn = new Function(declerations + codeStr) } catch (e) { /* eslint-disable-line no-new-func */
    print(`${e.name}: ${e.message}`)
    withSourceLocation(e, result?.map, (e, line, column) => {
      if (line) print(`On line ${line}`, '')
      if (column) print(` at column ${column}`)
    })
    return
  }
  // Execute code here. Might get in an infinite loop and lock the session!
  // after running for x seconds, declear good run and save
  try { localStorage.setItem('ga-maybe-hung', 'true') } catch (e) { console.warn(e) }
  hangCheckTimeout = setTimeout(resolveHangCheckAndSave, 5_000)
  clearOutput()
  clearView()
  cm.clear() // clear contexts between runs
  if (fn) {
    try { print(`${fn.apply(context)}`) } catch (e) {
      print(`${e.name}: ${e.message}`)
      withSourceLocation(e, result?.map, (e, line, column) => {
        if (line) print(`On line ${line}`, '')
        if (column) print(` at column ${column}`)
      })
    }
  }
}

/// /////////////////////////////////////////
/// Codemirror

const evalPlugin = ViewPlugin.fromClass(class {
  constructor () {
    this.w = new WaitTillUndisturbedFor(500)
    this.w.on('timeout', run)
  }

  update (update) { if (update.docChanged) this.w.disturb() }
})

const TEMPLATE = `\
const point = (x,y) => !(1e0 + x*1e1 + y*1e2);
const A = point(1, 1.2);
const B = point(-0.5, 0);

graph([
  "",             // First label is used as title.
  0x008844,       // Set darker green
  A, "A",         // Render point A and label it.
  B, "B",
  A & B, "A & B",
  0x4466AA,       // Blue
  (A & B) ^ 1e1   // Y Intercept
],{
  grid        : true, // Display a grid
  labels      : true, // Label the grid
  lineWidth   : 3,    // Custom lineWidth (default=1)
  pointRadius : 1,    // Custon point radius (default=1)
  fontSize    : 1,    // Custom font size (default=1)
  scale       : 1,    // Custom scale (default=1), mousewheel.
});

print("A = " + A);
print("B = " + B);

// Display last expression
(A & B) ^ 1e1;`

// Initalise codemirror
{
  const extensions = [basicSetup, javascript(), evalPlugin]
  const parent = document.getElementById('code')
  let state
  try {
    const jsonStr = localStorage.getItem('ga-cm-state') // could throw if cache disabled
    const json = JSON.parse(jsonStr) // could throw if bad json
    if (json) state = EditorState.fromJSON(json, { extensions }, { foldState }) // could throw if bad object
  } catch (e) { console.warn(e) }

  if (state) console.info('Loading from cache')
  editor = new EditorView(state ? { state, parent } : { doc: TEMPLATE, extensions, parent })

  let runOnStart = true // should we run on start
  try { runOnStart = localStorage.getItem('ga-maybe-hung') !== 'true' } catch (e) { console.warn(e) }
  if (!runOnStart) {
    console.info('recovered from possible hang')
    try { localStorage.setItem('ga-maybe-hung', 'false') } catch (e) { console.warn(e) }
  } else run()
}

/// /////////////////////////////////////////
/// Window logic

// Mouse events for resizing the main view, code, and output panels
{
  const getWidth = () => document.body.clientWidth || document.documentElement.clientWidth || window.innerWidth
  const elV = document.getElementById('view')
  const elC = document.getElementById('code')
  let json
  try {
    const jsonStr = localStorage.getItem('ga-div-state') // could throw if cache disabled
    json = JSON.parse(jsonStr) // could throw if bad json
  } catch (e) { console.warn(e) }
  if (json?.mainDiv && !isNaN(json.mainDiv)) elV.style['flex-basis'] = json.mainDiv * getWidth() + 'px'
  if (json?.editorDiv && !isNaN(json.editorDiv)) elC.style['flex-basis'] = json.editorDiv * getWidth() + 'px'

  const w = new WaitTillUndisturbedFor(500)
  w.on('timeout', () => {
    if (!json) json = {}
    json.mainDiv = parseFloat(elV.style['flex-basis']) / getWidth()
    json.editorDiv = parseFloat(elC.style['flex-basis']) / getWidth()
    try { localStorage.setItem('ga-div-state', JSON.stringify(json)) } catch (e) { console.warn(e) }
  })

  const elMd = document.getElementById('main-div')
  const elEd = document.getElementById('editor-div')
  const ddMd = new DragDetector(elMd) // view resize
  const ddEd = new DragDetector(elEd) // output resize
  ddMd.on('dragging', e => {
    elV.style['flex-basis'] = (e.clientX - elV.clientLeft - elMd.clientWidth / 2) + 'px'
    w.disturb()
  })
  ddEd.on('dragging', e => {
    elC.style['flex-basis'] = (e.clientY - elC.clientTop - elEd.clientHeight / 2) + 'px'
    w.disturb()
  })

  const dblClickMd = new DblClickDetector(elMd) // double click to snap resize view
  dblClickMd.on('dblclick', e => {
    const minWidth = getWidth() * 0.33 // side 1/3
    const initWidth = getWidth() * 0.47 // middle 1/2
    if (view.clientWidth > initWidth + 2 || Math.abs(view.clientWidth - minWidth) < 2) elV.style['flex-basis'] = initWidth + 'px'
    else elV.style['flex-basis'] = minWidth + 'px' // else snap to smallest view size before the code window overlaps it
    w.trigger()
  })
}

// full window keyboard shortcuts (codemirror editor will have it's own)
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
    e.preventDefault()
    run({ force: true }) // force
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    saveState()
  }
})
