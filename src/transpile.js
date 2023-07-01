import * as recast from 'recast'

// Insertion sort that counts the number of swaps made so that we know if the sign changes
const insertionSort = (digitStrings) => {
  let nswaps = 0
  for (let i = 1; i < digitStrings.length; i++) {
    let j = i
    // Note: compare only the first digit
    while (j > 0 && digitStrings[j][0] < digitStrings[j - 1][0]) {
      const tmp = digitStrings[j]
      digitStrings[j] = digitStrings[j - 1]
      digitStrings[j - 1] = tmp
      j -= 1
      nswaps += 1
    }
  }
  return nswaps
}

const UNARY = {
  '!': 'Dual',
  '~': 'Conjugate',
  '-': 'Reverse', // - reverse ba = −ab
  '+': 'UnaryPlus' // specially added, does nothing
}
const UPDATE = { '++': 'Add', '--': 'Sub' }
const BINARY = {
  '**': 'Pow',
  '^': 'Wedge',
  '&': 'Vee',
  '<<': 'LDot',
  '>>': 'LDot', // arguments will be reversed
  '*': 'Mul',
  '|': 'Dot',
  '/': 'Div', // right handed
  '-': 'Sub',
  '+': 'Add',
  '==': 'eq',
  '===': 'eq',
  '!=': 'neq',
  '!==': 'neq',
  '<': 'lt',
  '>': 'gt',
  '<=': 'lte',
  '>=': 'gte',
  '>>>': 'sw' // sandwich
}

const B = recast.types.builders
const N = recast.types.namedTypes
const trBinaryExpression = (path, methodStr, op) => {
  const args = [path.node.left, path.node.right]
  if (op === '>>') args.reverse()
  return B.callExpression(B.identifier('_$'), [B.literal(methodStr), ...args])
}

// Check for scientific notation (eg +1.0e23) to be reinterpreted as a basis vector multiple.
// Note: we ignore cases where the exponent has an explicit sign eg +1.0e-23 or +1.0e+23 so that
// we can still specify floats too
const BASIS_NOTATION_REGEX = /([+-]?(?:\d+(?:\.\d*)?|\.\d+))[eE](\d+)/
// Split a string into groups of same digits eg 1112223 => ["111", "222", "3"]
const BASIS_SAME_DIGITS_REGEX = /((\d)\2*)/g

// Converts ganja.js javascript to runable javascript using the `_$()` function in
// place of operators (since javascript doesn't have operator overloading).
// Return a recast object. The transpiled code is accessible at transpile(sourceStr).code
// and the source maps are avaliable at transpile(sourceStr).map
export const transpile = (sourceStr, errFn = console.error) => {
  let ast
  try { ast = recast.parse(sourceStr, { sourceFileName: 'source.js' }) } catch (e) { errFn(e) }
  if (!ast) return

  // make operator overloading work by calling ganja.js static methods
  // also convert scientific notation to ganja.js coefficents
  recast.types.visit(ast, {
    visitBinaryExpression (path) {
      this.traverse(path)
      const methodStr = BINARY[path.node.operator]
      if (!methodStr) return
      path.replace(trBinaryExpression(path, methodStr, path.node.operator))
    },
    visitAssignmentExpression (path) {
      this.traverse(path)
      const op = path.node.operator.slice(0, -1)
      const methodStr = BINARY[op]
      if (!methodStr) return
      path.replace(B.assignmentExpression('=', path.node.left, trBinaryExpression(path, methodStr, op)))
    },
    visitUnaryExpression (path) {
      this.traverse(path)
      const methodStr = UNARY[path.node.operator]
      if (!methodStr) return
      path.replace(B.callExpression(B.identifier('_$'), [B.literal(methodStr), path.node.argument]))
    },
    visitUpdateExpression (path) {
      this.traverse(path)
      const methodStr = UPDATE[path.node.operator]
      if (!methodStr) return
      const args = [path.node.argument, B.literal(1)]
      if (path.node.prefix) args.reverse()
      path.replace(B.assignmentExpression('=', path.node.argument, B.callExpression(B.identifier('_$'), [B.literal(methodStr), ...args])))
    },
    visitLiteral (path) {
      this.traverse(path)
      const m = BASIS_NOTATION_REGEX.exec(path.node.raw)
      if (!m) return
      const multiplier = m[1]; const basis = m[2]
      const digitStrings = [...basis.matchAll(BASIS_SAME_DIGITS_REGEX)].map(m => m[0])
      const nswaps = insertionSort(digitStrings)
      // Assume the most common case is that no reduction is needed. In the case it is (eg e111 -> e1) call SciReduce
      // If each digitString is a single digit, the sum of lengths is equal to the length
      const name = digitStrings.reduce((a, x) => a + x.length, 0) === digitStrings.length ? 'Sci' : 'SciReduce'
      // If there are an odd number of swaps then flip the sign. This is about all we can do without knowing the specific algebra
      const first = B.literal((nswaps % 2) === 0 ? parseFloat(multiplier) : -parseFloat(multiplier))
      path.replace(B.callExpression(B.identifier('_$'), [B.literal(name), first, B.literal(digitStrings.join(''))]))
    }
  })

  // convert last expression statement into a return statement
  const bod = ast.program.body
  if (N.ExpressionStatement.check(bod.at(-1))) bod.push(B.returnStatement(bod.pop().expression))

  const result = recast.print(ast, { sourceMapName: 'source.min.js' })

  // console.log(result.code); // Resulting string of code.
  return result
}
