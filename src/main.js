import { EditorView, basicSetup } from 'codemirror'
import { foldState } from '@codemirror/language'
import { javascript } from '@codemirror/lang-javascript'
import { ViewPlugin } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { parseScript, Syntax } from 'esprima'
import { inline as translate, _Expand, _ExpandCoeff, _ctxerr, activeContexts } from './ganja-translator'
import Algebra from '../libs/ganja.js/ganja'
import { DblClickDetector, DragDetector } from './click'

const view = document.getElementById('view')
let editor

////////////////////////////////////////////
/// Script execution

const EXPRESSIONS = [] // find all ast nodes that have "Expression" in them
for (const name in Syntax) if (name.includes('Expression')) EXPRESSIONS.push(name)

const prep = (codeStr, errFn) => {
  // Add return to last expression, return values in last declaration, remove blank lines + whitespace
  // If there's a syntax error, call errFn if provided. Returns new string of code to become a function body
  // Note: can still do strange stuff (not add return) bc of javascripts silly automatic semicolon insertion rules
  let ast
  try { ast = parseScript(codeStr, { range: true }) } catch (e) { (errFn ?? console.error)(e) }
  if (!ast?.body?.length) return '' // Ensure non-empty array
  const last = ast?.body.at(-1)
  if (EXPRESSIONS.indexOf(last?.type) >= 0) { // Convert last expression to a return
    codeStr = codeStr.slice(0, last.range[0]) + 'return ' + codeStr.slice(last.range[0], codeStr.length)
  } else if (last?.type === Syntax.VariableDeclaration) { // Add return for last variable(s) decleared
    if (last.declarations.length <= 1) codeStr += `\nreturn ${last.declarations.at(0).id.name}`
    else codeStr += `\nreturn {${last.declarations.map(x => x.id.name).join(',')}}`
  }
  return codeStr.split('\n').map(x => x.trim()).filter(x => x !== '').join('\n')
}

const outputEl = document.getElementById('output')
const clearOutput = () => { outputEl.textContent = '' }
const clearView = () => { view.innerHTML = '' }
const print = (s, end = '\n') => { outputEl.textContent += `${s}` + end }
const getAlgebra = () => activeContexts.at(-1)
const graph = (...args) => {
  const g = getAlgebra()?.graph(...args)
  view.appendChild(g)
  g.style.width = g.style.height = ''
  return g
}
const deadContexts = []
const pushAlgebra = (...args) => {
  // Ensure no duplicates of algebras for interoperability
  const a = Algebra(...args)
  let existing = activeContexts.find((x) => `${x.basis}` === `${a.basis}`)
  if (!existing) existing = deadContexts.find((x) => `${x.basis}` === `${a.basis}`)
  if (!existing) existing = a
  activeContexts.push(existing) // reference same object again if possible
  return activeContexts.at(-1)
}
const popAlgebra = () => { const p = activeContexts.pop(); deadContexts.push(p); return p }

// Edit declearations and context to determine default behaviour and avaliable variables/functions
const context = { print, graph, pushAlgebra, popAlgebra, getAlgebra, _Expand, _ExpandCoeff, _ctxerr }
const declerations = `const{${Object.keys(context).join(',')}}=this;\npushAlgebra(2,0,1)` // default to 2D pga

const resolveHangCheckAndSave = () => {
  try {
    saveState() // could fail if cache disabled, or cm does weird stuff
    localStorage.setItem('ga-maybe-hung', 'false') // could fail if cache disabled
  } catch (e) { console.warn(e) }
}

// In case we leave the page during the wait time, we don't want it to look like the page hung
// Note: this doesn't trigger a save
let hangCheckTimeout
window.addEventListener('beforeunload', (event) => {
  if (hangCheckTimeout) {
    clearTimeout(hangCheckTimeout)
    hangCheckTimeout = null
    try { localStorage.setItem('ga-maybe-hung', 'false') } catch (e) { console.warn(e) } // could fail if cache disabled
  }
})

let prev
const run = (opts = { force: false }) => {
  // Cancel hang check since we have been able to restart so things must be fine
  clearTimeout(hangCheckTimeout)
  hangCheckTimeout = null
  try { localStorage.setItem('ga-maybe-hung', 'false') } catch (e) { console.warn(e) }
  const codeStr = prep(editor?.state?.doc?.toString() ?? '', e => {
    clearOutput() // from previous run
    prev = null // ensure we rerun next time
    print(`Syntax: ${e}`)
  })
  if (!codeStr.trim()) return // either error or no code to run
  if (!opts?.force && prev === codeStr) return // don't run again unless forced
  prev = codeStr
  clearOutput() // clear console output
  clearView()
  // after running for x seconds, declear good run and save
  try { localStorage.setItem('ga-maybe-hung', 'true') } catch (e) { console.warn(e) }
  const codeTranslated = translate(codeStr) // include this here as may hang too
  // if this can execute after x seconds (the main thread isn't blocked) then safe code to save
  hangCheckTimeout = setTimeout(resolveHangCheckAndSave, 5_000)
  activeContexts.splice(0, activeContexts.length) // clear contexts between runs
  deadContexts.splice(0, deadContexts.length)
  let fn
  try { fn = new Function(declerations + '\n' + codeTranslated) } catch (e) { print(`Eval: ${e}`) } /* eslint-disable-line no-new-func */
  // Execute code here. Might get in an infinite loop and lock the session!
  if (fn) try { print(`${fn.apply(context)}`) } catch (e) { print(`Runtime: ${e}`) }
}


////////////////////////////////////////////
/// Codemirror

const saveState = () => { // cache
  const json = JSON.stringify(editor.state.toJSON({ foldState }))
  localStorage.setItem('ga-cm-state', json)
  console.info('saved')
}

let undisturbedTimeout
const waitTillUndisturbed = (fn) => {
  if (undisturbedTimeout) clearTimeout(undisturbedTimeout)
  undisturbedTimeout = setTimeout(() => { undisturbedTimeout = null; fn() }, 500)
}

const evalPlugin = ViewPlugin.fromClass(class {
  update (update) {
    if (update.docChanged) waitTillUndisturbed(() => run())
  }
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

////////////////////////////////////////////
/// Window logic

// Mouse events for resizing the main view, code, and output panels
{
  const elMd = document.getElementById('main-div')
  const elEd = document.getElementById('editor-div')
  const elV = document.getElementById('view')
  const elC = document.getElementById('code')

  const ddMd = new DragDetector(elMd) // view resize
  ddMd.on('dragging', e => { elV.style['flex-basis'] = (e.clientX - elV.clientLeft - elMd.clientWidth / 2) + 'px' })
  const ddEd = new DragDetector(elEd) // output resize
  ddEd.on('dragging', e => { elC.style['flex-basis'] = (e.clientY - elC.clientTop - elEd.clientHeight / 2) + 'px' })

  const dblClickMd = new DblClickDetector(elMd) // double click to snap resize view
  dblClickMd.on('dblclick', e => {
    const minWidth = document.body.clientWidth * 0.33  // side 1/3
    const initWidth = document.body.clientWidth * 0.47  // middle 1/2
    if (view.clientWidth > initWidth + 2 || Math.abs(view.clientWidth - minWidth) < 2) elV.style['flex-basis'] = initWidth + 'px'
    else elV.style['flex-basis'] = minWidth + 'px'  // else snap to smallest view size before the code window overlaps it
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