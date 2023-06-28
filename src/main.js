import { EditorView, basicSetup } from 'codemirror'
import { foldState } from '@codemirror/language'
import { javascript } from '@codemirror/lang-javascript'
import { ViewPlugin } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { parseScript, Syntax } from 'esprima'
import { inline as translate, _Expand, _ExpandCoeff, _ctxerr, activeContexts } from './ganja-translator'
import Algebra from '../libs/ganja.js/ganja'

window.Algebra = Algebra // so that it's not pruned

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

const view = document.getElementById('view')

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
const graph = (...args) => {
  const g = activeContexts.at(0)?.graph(...args)
  view.appendChild(g)
  g.style.width = g.style.height = ''
  return g
}
const pushAlgebra = (...args) => {
  // Ensure no duplicates of algebras for interoperability
  const a = Algebra(...args)
  const loc = activeContexts.find((x) => `${x.basis}` === `${a.basis}`)
  if (loc) activeContexts.unshift(activeContexts.at(loc)) // reference same object again
  else activeContexts.unshift(a)
  return activeContexts.at(0)
}
const popAlgebra = () => activeContexts.shift()
const getAlgebra = () => activeContexts.at(0)

// Edit declearations and context to determine default behaviour and avaliable variables/functions
const context = { print, graph, pushAlgebra, popAlgebra, getAlgebra, _Expand, _ExpandCoeff, _ctxerr }
const declerations = `const{${Object.keys(context).join(',')}}=this;\npushAlgebra(2,0,1)` // default to 2D pga

const resolveHangCheckAndSave = () => {
  try {
    saveState() // could fail if cache disabled, or cm does weird stuff
    localStorage.setItem('ga-maybe-hung', 'false') // could fail if cache disabled
  } catch (e) { console.warn(e) }
}

let prev, hangCheckTimeout
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
  let fn
  try { fn = new Function(declerations + '\n' + codeTranslated) } catch (e) { print(`Eval: ${e}`) } /* eslint-disable-line no-new-func */
  // Execute code here. Might get in an infinite loop and lock the session!
  if (fn) try { print(`${fn.apply(context)}`) } catch (e) { print(`Runtime: ${e}`) }
}

// In case we leave the page during the wait time, we don't want it to look like the page hung
// Note: this doesn't trigger a save
window.addEventListener('beforeunload', (event) => {
  if (hangCheckTimeout) {
    clearTimeout(hangCheckTimeout)
    hangCheckTimeout = null
    try { localStorage.setItem('ga-maybe-hung', 'false') } catch (e) { console.warn(e) } // could fail if cache disabled
  }
})

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

const extensions = [basicSetup, javascript(), evalPlugin]
const parent = document.getElementById('code')

let state
try {
  const jsonStr = localStorage.getItem('ga-cm-state') // could throw if cache disabled
  const json = JSON.parse(jsonStr) // could throw if bad json
  if (json) state = EditorState.fromJSON(json, { extensions }, { foldState }) // could throw if bad object
} catch (e) { console.warn(e) }

if (state) console.info('Loading from cache')
/* eslint-disable-next-line no-unused-vars */
const editor = new EditorView(state ? { state, parent } : { doc: 'let A = 1e1 + 1e2', extensions, parent })

let runOnStart = true // should we run on start
try { runOnStart = localStorage.getItem('ga-maybe-hung') !== 'true' } catch (e) { console.warn(e) }
if (!runOnStart) {
  console.log('recovered from possible hang')
  try { localStorage.setItem('ga-maybe-hung', 'false') } catch (e) { console.warn(e) }
} else run()

/** ***** Tester code

const E = getAlgebra()
const point = (x,y) => 1e12 + -x*1e02 + y*1e01
const A = point(1, 2)

graph([
  "",             // First label is used as title.
  0x008844,       // Set darker green
  A, "A",         // Render point A and label it.
],{
  grid        : true, // Display a grid
  labels      : true, // Label the grid
  lineWidth   : 3,    // Custom lineWidth (default=1)
  pointRadius : 1,    // Custon point radius (default=1)
  fontSize    : 1,    // Custom font size (default=1)
  scale       : 1,    // Custom scale (default=1), mousewheel.
})

A

*******/
