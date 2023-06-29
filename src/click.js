import { EventEmitter } from 'events'

export class DragDetector extends EventEmitter {
  constructor (target) {
    super()
    this.isDown = false
    target.addEventListener('mousedown', e => { this.isDown = true })
    document.addEventListener('mouseup', e => { this.isDown = false })
    document.addEventListener('mousemove', e => { if (this.isDown) this.emit('dragging', e) })
  }
}

export class DblClickDetector extends EventEmitter {
  constructor (target, timeout=2000) {
    super()
    this.timeout = timeout
    this.x = this.y = null
    this.to = null
    this.nclicks = 0
    target.addEventListener('mousedown', e => {
      if (e.clientX !== this.x || e.clientY !== this.y) this.nclicks = 0
      this.x = e.clientX; this.y = e.clientY
    })
    document.addEventListener('mouseup', e => {
      if (e.clientX !== this.x || e.clientY !== this.y) { this.nclicks = 0; return }
      if (this.to) clearTimeout(this.to)
      this.nclicks += 1
      if (this.nclicks === 2) { this.emit('dblclick', e); this.nclicks = 0 }
      else this.to = setTimeout(() => { this.nclicks = 0 }, this.timeout) // max two seconds between releases
    })
  }
}