import * as THREE from 'three'

import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { Pane } from 'tweakpane'

import Stats from 'three/examples/jsm/libs/stats.module.js'

/// ///////////////////////////////////////////////////////////
/// GUI

const containerElement = document.getElementById('container')
// create 3 panels for FPS, MS, and MB, and have them staggered down the left
const stats = []
for (let i = 0; i < 3; i++) {
  const s = new Stats()
  s.showPanel(i)
  const offset = parseInt(s.domElement.firstElementChild.style.height) * i
  s.domElement.style.top = offset.toString() + 'px'
  document.body.appendChild(s.domElement)
  stats.push(s)
}

const pane = new Pane({
  title: 'Tangle 2D'
})
pane.element.style.userSelect = 'none' // stop label text being selected on dbl clk

const GUI_PARAMS = {
  mode: 'pm',
  position: { x: 0, y: 0 }
}
const REFLECTIONS = {
  x: false,
  y: false,
  xy: false,
  yx: false
}

const ROTATIONS = {
  '90': true,
  '180': false,
  '-90': false
}

const coordsGUI = pane.addInput(GUI_PARAMS, 'position', {
  x: { min: -200, max: 200 },
  y: { min: -200, max: 200 }
})

const NAMES = ['p1', 'p2', 'pm', 'pg']

// {
//   const opts = {}
//   for (const key of NAMES) opts[key] = key
//   pane.addInput(GUI_PARAMS, 'mode', {options: opts})
// }

{
  const f0 = pane.addFolder({title: "Reflections"})
  f0.on('change', (ev) => {
    updateInterior()
    needsRender = true
  })
  f0.addInput(REFLECTIONS, 'x')
  f0.addInput(REFLECTIONS, 'y')
  f0.addInput(REFLECTIONS, 'xy')
  f0.addInput(REFLECTIONS, 'yx')
}

{
  const f0 = pane.addFolder({title: "Rotations"})
  f0.on('change', (ev) => {
    updateInterior()
    needsRender = true
  })
  f0.addInput(ROTATIONS, '90')
  f0.addInput(ROTATIONS, '180')
  f0.addInput(ROTATIONS, '-90')
}

/// ///////////////////////////////////////////////////////////
/// Web GL

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(window.devicePixelRatio)
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = false
containerElement.appendChild(renderer.domElement)

/// ///////////////////////////////////////////////////////////
/// setup 3d scene

const scene = new THREE.Scene()
scene.background = new THREE.Color(0xf0f0f0)
scene.add(new THREE.AmbientLight(0xfafafa))

const camera = new THREE.OrthographicCamera()
{
  const w = window.innerWidth / 2
  const h = window.innerHeight / 2
  camera.left = -w
  camera.right = w
  camera.top = h
  camera.bottom = -h
}
camera.near = 1
camera.far = 4000
camera.position.set(0, 0, 750)
camera.zoom = 1
camera.updateProjectionMatrix() // must be caused when parameters change (eg camera.zoom)
scene.add(camera)

const SIZE = 100
const planeGeo = new THREE.PlaneGeometry(2*SIZE, 2*SIZE)
const planeMat = new THREE.MeshBasicMaterial({
  color: 0xe0e0e0,
  side: THREE.DoubleSide
})


// neighbours
const tesses = [[0, 2*SIZE],[2*SIZE, 0],[0, -2*SIZE],[-2*SIZE, 0]]
const planes = []
for (const [x, y] of tesses) {
  const plane = new THREE.Mesh(planeGeo, planeMat)
  plane.position.x = x
  plane.position.y = y
  scene.add(plane)
  planes.push(plane)
}

// dot
const texture = new THREE.TextureLoader().load('images/duck.png', () => {
  updateInterior()
  needsRender = true
})

const duckPlane = new THREE.PlaneGeometry(20, 20)
const duckMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true })
const duckCloneMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.2})
const duck = new THREE.Mesh(duckPlane, duckMat)
scene.add(duck)
duck.position.x = 40
duck.position.y = 20
const cloneDuck = new THREE.Mesh(duckPlane, duckCloneMat)
const cloneGroup = new THREE.Group()
cloneGroup.add(cloneDuck)

const applySymmetry = (cur, temp) => {
  const g = new THREE.Group()
  g.add(cur)
  g.add(temp)
  return g
}
const applyMat = (cur, m) => {
  const [[a, b], [c, d]] = m  // these are column vectors
  const mat = new THREE.Matrix4();
  mat.set(a, c, 0, 0,
          b, d, 0, 0,
          0, 0, 1, 0,
          0, 0, 0, 1)
  
  cur.applyMatrix4(mat)
  return cur
}

let cur
let dups = []
const updateInterior = () => {
  if (cur) {
    scene.remove(cur)
    for (let i = 0; i < planes.length; i++) {
      planes[i].remove(dups[i])
    }
    dups = []
  }
  cur = cloneGroup
  cloneDuck.position.x = duck.position.x
  cloneDuck.position.y = duck.position.y
  
  for (let i = 0; i < 1; i++) {
    if (REFLECTIONS.x) {
      const temp = cur.clone()
      const m = [[-1, 0],[0, 1]]
      applyMat(temp, m)
      cur = applySymmetry(cur, temp)
    }

    if (REFLECTIONS.y) {
      const temp = cur.clone()
      const m = [[1, 0],[0, -1]]
      applyMat(temp, m)
      cur = applySymmetry(cur, temp)
    }

    if (REFLECTIONS.xy) {
      const temp = cur.clone()
      const m = [[0, 1],[1, 0]]
      applyMat(temp, m)
      cur = applySymmetry(cur, temp)
    }

    if (REFLECTIONS.yx) {
      const temp = cur.clone()
      const m = [[0, -1],[-1, 0]]
      applyMat(temp, m)
      cur = applySymmetry(cur, temp)
    }

    if (ROTATIONS['90']) {
      const temp = cur.clone()
      const m = [[0, 1],[-1, 0]]
      applyMat(temp, m)
      cur = applySymmetry(cur, temp)
    }

    if (ROTATIONS['180']) {
      const temp = cur.clone()
      const m = [[-1, 0],[0, -1]]
      applyMat(temp, m)
      cur = applySymmetry(cur, temp)
    }

    if (ROTATIONS['-90']) {
      const temp = cur.clone()
      const m = [[0, -1],[1, 0]]
      applyMat(temp, m)
      cur = applySymmetry(cur, temp)
    }
  }

  scene.add(cur)

  for (let i = 0; i < planes.length; i++) {
    const d = cur.clone()
    dups.push(d)
    planes[i].add(d)
  }

  // todo
  // calc eigenvectors thus reflection, rotation?
  // where do glides come into this
  // also surface symmetries vs valume symmetries
  // 
  // maybe try ga approach, should work this way too thou
  //

  // in file we need to know transformations for neighbour units
  // we need to know symmetries, these could be
  // - as a result of neighbours being self for some transform of it
  // - because of a pattern we are designing for
  // - because of surface symmetries we want
  // - optionally, because of internal symmetries we want
  // the last one is less important because it will not effect which
  // units we can connect to, it will only impact if there are left and
  // right handed versions (I'd think)
  //
  // ascii renderer for documenting code, don't do it
  //
  //       /----------/
  //      /          /
  //     /     +    /
  //    /----------/
}

// Tool for moving points around
const transformControl = new TransformControls(camera, renderer.domElement)
transformControl.setSize(0.5)
scene.add(transformControl)

transformControl.addEventListener('change', () => {
  const o = transformControl.object
  if (o) {
    const pos = o.position
    GUI_PARAMS.position.x = pos.x = Math.min(SIZE, Math.max(-SIZE, pos.x))
    GUI_PARAMS.position.y = pos.y = Math.min(SIZE, Math.max(-SIZE, pos.y))
    coordsGUI.refresh()
    updateInterior(pos.x, pos.y)
    needsRender = true
  }
})

coordsGUI.on('change', (ev) => {
  const { x, y } = ev.value
  const pos = transformControl.object.position
  pos.x = x
  pos.y = y
  needsRender = true
})

// window.addEventListener('keydown', (ev) => {
//   if (ev.key === 'Backspace' || ev.key === 'Delete')
// })

/// ///////////////////////////////////////////////////////////
/// mouse events

{
  const lastDownPos = new THREE.Vector2()
  containerElement.addEventListener('pointerdown', (ev) => {
    ev.preventDefault() // prevent GUI overlay from being selectable with double click
    lastDownPos.x = ev.clientX
    lastDownPos.y = ev.clientY
  })

  const lastUpPos = new THREE.Vector2()
  const raycaster = new THREE.Raycaster()
  containerElement.addEventListener('pointerup', (ev) => {
    ev.preventDefault() // prevent GUI overlay from being selectable with double click
    lastUpPos.x = ev.clientX
    lastUpPos.y = ev.clientY

    // click and release
    if (lastDownPos.distanceTo(lastUpPos) !== 0) return
    
    raycaster.setFromCamera(mousePos, camera)

    const hits = raycaster.intersectObjects([duck], true)
    const activeObject = hits[0]?.object || null

    if (activeObject && activeObject !== transformControl.object) {
      // enable transform tool if click on top
      transformControl.attach(activeObject)
      needsRender = true
    } else if (transformControl.object) {
      // disable transform tool if click away
      transformControl.detach()
      needsRender = true
    }
  })

  const mousePos = new THREE.Vector2()
  containerElement.addEventListener('pointermove', (ev) => {
    mousePos.x = (ev.clientX / window.innerWidth) * 2 - 1
    mousePos.y = -(ev.clientY / window.innerHeight) * 2 + 1
  })
}

/// ///////////////////////////////////////////////////////////
/// window events

window.addEventListener('resize', () => {
  const w = window.innerWidth / 2
  const h = window.innerHeight / 2
  camera.left = -w
  camera.right = w
  camera.top = h
  camera.bottom = -h
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  needsRender = true
})

/// ///////////////////////////////////////////////////////////
/// updates

let needsRender = true
const update = () => {
  if (needsRender) {
    needsRender = false
    renderer.render(scene, camera)
  }
  requestAnimationFrame(update)
}
requestAnimationFrame(update) // start updating each frame
