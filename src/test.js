export function test(t) {
  let lv = "test"
  // return eval('()=>{return outer}')
  return eval(t.toString())
}