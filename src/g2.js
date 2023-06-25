
import Algebra from "ganja.js"


var g2 = Algebra(2)
var point = g2.inline((x, y)=>x*1e1+y*1e2)
var line = g2.inline((x, y)=>{
  const n = Math.sqrt(x*x + y*y)
  return (x/n)*1e1 + (y/n)*1e2
})
var p1 = point(1, 2)
var l1 = line(1, 2)

var pga = Algebra(2,0,1)
var _point = pga.inline((p)=>!(1e0 + p[1]*1e1 + p[2]*1e2))
var _line = pga.inline((l)=>((-1/l[1])*1e1+(1/l[2])*1e2))
var A = _point(p1)
var B = _line(l1)

// Create a Clifford Algebra with 2,0,1 metric. 
pga.inline((A, B)=>{
  // We now use the graph function to create an SVG object that visualises 
  // our algebraic elements. The graph function accepts an array of items 
  // that it will render in order. It can render points, lines, labels, 
  // colors, line segments and polygons.
  document.body.appendChild(this.graph([
    "Drag A,B,C",   // First label is used as title.
    0x008844,       // Set darker green
    A, "A",         // Render point A and label it.
    B, "B"
  ],{
    grid        : true, // Display a grid
    labels      : true, // Label the grid
    lineWidth   : 3,    // Custom lineWidth (default=1)
    pointRadius : 1,    // Custon point radius (default=1)
    fontSize    : 1,    // Custom font size (default=1)
    scale       : 1,    // Custom scale (default=1), mousewheel.
  }));
})(A, B);
// const Z = two.inline((x, y)=>{;

// const p1 = point(1, 2)

// console.log(Z)
// const multivector = (s, e1, e2, e12) => {
//   // e12 => I, the bivector part e1 ^ e2, represents oriented area of plane
//   // sometimes called the basis bivector or pseudo-scalar (because there is only one of them in any dimension)
//   // e1, e2 => vector parts
//   // s => scalar parts

//   return {s, e1, e2, e12}
// }

// const vector = (e1, e2) => {
//   // orthogonal components of 2d vector, representing 2d point/direction?
//   return {s:0, e1, e2, e12:0}
// }

// const complex = (s, e12) => {
//   // complex number a + b*i <=> a*s + b*e12
//   return {s, e1:0, e2:0, e12}
// }

// const line = (e1, e2, e12=0) => {
//   // e1, e2 are the unit vector of the direction of the line
//   // e12 is the distance from the origin to the line if you drew
//   // a line perpendicular to the line through the origin
//   const n = Math.sqrt(e1*e1 + e2*e2)  // ensure normalised
//   return {s:0, e1:e1/n, e2:e2/n, e12}
// }

