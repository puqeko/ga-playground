/* eslint-disable */
// adapted from ganja.js v1.0.204

export const activeContexts = []
export const _ctxerr = () => {throw Error('Use `pushActive(Algebra(...))` to create context for 1e1 notation')}

export const _Expand = (name, ...args) => (activeContexts.at(-1) ?? _ctxerr())[name](...args)
export const _ExpandCoeff = (idx, b) => {
  const ctx = activeContexts.at(-1) ?? _ctxerr()
  return ctx.Coeff(ctx.basis.indexOf(idx), b)  // requires basis property added to the class returned by ganja.js
}

// pushActive(Algebra(2))
// exports.out = 1e1 + 2e2

// String-simplify a concatenation of two basis blades. (and supports custom basis names e.g. e21 instead of e12)
// This is the function that implements e1e1 = +1/-1/0 and e1e2=-e2e1. The brm function creates the remap dictionary.
var simplify = (s,p,q,r)=>{
  var sign=1,c,l,t=[],f=true,ss=s.match(/(\d)/g);if (!ss) return s; s=ss; l=s.length
  while (f) { f=false
  // implement Ex*Ex = metric.
  // Assumed low's value (e1 is lowest basis) so not to depend on Algebra, could cause errors
    const low = 1
    for (var i=0; i<l;) if (s[i]===s[i+1]) { if ((s[i]-low)>=(p+r)) sign*=-1; else if ((s[i]-low)<r) sign=0;i+=2; f=true } else t.push(s[i++])
    // implement Ex*Ey = -Ey*Ex while sorting basis vectors.
    for (var i=0; i<t.length-1; i++) if (t[i]>t[i+1]) { c=t[i];t[i]=t[i+1];t[i+1]=c;sign*=-1;f=true; break} if (f) { s=t;t=[];l=s.length }
  }
  var ret=(sign==0)?'0':((sign==1)?'':'-')+(t.length?'e'+t.join(''):'1'); return ret
}

export const inline = (intxt) => {
  // // If we are called as a template function.
  //   if (arguments.length>1 || intxt instanceof Array) {
  //     var args=[].slice.call(arguments,1);
  //     return inline(new Function(args.map((x,i)=>'_template_'+i).join(),'return ('+intxt.map((x,i)=>(x||'')+(args[i]&&('_template_'+i)||'')).join('')+')')).apply(this,args);
  //   }
  // Get the source input text.
  // var txt = (intxt instanceof Function)?intxt.toString():`function(){return (${intxt})}`;
  var txt = intxt
  // Our tokenizer reads the text token by token and stores it in the tok array (as type/token tuples).
  var tok = [], resi=[], t, possibleRegex=false, c, tokens = [/^[\s\uFFFF]|^[\u000A\u000D\u2028\u2029]|^\/\/[^\n]*\n|^\/\*[\s\S]*?\*\//g,                 // 0: whitespace/comments
    /^\"\"|^\'\'|^\".*?[^\\]\"|^\'.*?[^\\]\'|^\`[\s\S]*?[^\\]\`/g,                                                                // 1: literal strings
    /^\d+[.]{0,1}\d*[ei][\+\-_]{0,1}\d*|^\.\d+[ei][\+\-_]{0,1}\d*|^e_\d*/g,                                                       // 2: literal numbers in scientific notation (with small hack for i and e_ asciimath)
    /^\d+[.]{0,1}\d*[E][+-]{0,1}\d*|^\.\d+[E][+-]{0,1}\d*|^0x\d+|^\d+[.]{0,1}\d*|^\.\d+/g,                                        // 3: literal hex, nonsci numbers
    /^\/.*?[^\\]\/[gmisuy]?/g,                                                                                                    // 4: regex
    /^(\.Normalized|\.Length|\.\.\.|>>>=|===|!==|>>>|<<=|>>=|=>|\|\||[<>\+\-\*%&|^\/!\=]=|\*\*|\+\+|\-\-|<<|>>|\&\&|\^\^|^[{}()\[\];.,<>\+\-\*%|&^!~?:=\/]{1})/g,   // 5: punctuator
    /^[$_\p{L}][$_\p{L}\p{Mn}\p{Mc}\p{Nd}\p{Pc}\u200C\u200D]*/gu]
  let protect = txt.length                                                          // 6: identifier
  while (txt.length) {
    if (protect-- < 0) {console.error('The tokenizer was protected against inf loop. Needs fixing');break}
    for (t in tokens) {
      if (t == 4 && !possibleRegex) continue
      if (resi = txt.match(tokens[t])) {
        c = resi[0]; if (t!=0) {possibleRegex = c == '(' || c == '=' || c == '[' || c == ',' || c == ';'} tok.push([t | 0, c]); txt = txt.slice(c.length); break
      }
    } // tokenise
  }
  // Translate algebraic literals. (scientific e-notation to "this.Coeff"
  tok=tok.map(t=>(t[0]==2)?[2,'_ExpandCoeff("'+simplify('e'+t[1].split(/e_|e|i/)[1]||1).replace('-','')+'",'+(simplify(t[1].split(/e_|e|i/)[1]||1).match('-')?'-1*':'')+parseFloat(t[1][0]=='e'?1:t[1].split(/e_|e|i/)[0])+')']:t)
  // String templates (limited support - needs fundamental changes.).
  tok=tok.map(t=>(t[0]==1 && t[1][0]=='`')?[1,t[1].replace(/\$\{(.*?)\}/g,a=>'${'+inline(a.slice(2,-1)).toString().match(/return \((.*)\)/)[1]+'}')]:t)  
  // We support two syntaxes, standard js or if you pass in a text, asciimath.
  // intxt instanceof Function
  var syntax = (true)?[[['.Normalized','Normalize',2],['.Length','Length',2]],[['~','Conjugate',1],['!','Dual',1]],[['**','Pow',0,1]],[['^','Wedge'],['&','Vee'],['<<','LDot']],[['*','Mul'],['/','Div']],[['|','Dot']],[['>>>','sw',0,1]],[['-','Sub'],['+','Add']],[['%','%']],[['==','eq'],['!=','neq'],['<','lt'],['>','gt'],['<=','lte'],['>=','gte']]]
    :[[['pi','Math.PI'],['sin','Math.sin']],[['ddot','this.Reverse'],['tilde','this.Involute'],['hat','this.Conjugate'],['bar','this.Dual']],[['^','Pow',0,1]],[['^^','Wedge'],['*','LDot']],[['**','Mul'],['/','Div']],[['-','Sub'],['+','Add']],[['<','lt'],['>','gt'],['<=','lte'],['>=','gte']]]
  // For asciimath, some fixed translations apply (like pi->Math.PI) etc ..
  tok=tok.map(t=>(t[0]!=6)?t:[].concat.apply([],syntax).filter(x=>x[0]==t[1]).length?[6,[].concat.apply([],syntax).filter(x=>x[0]==t[1])[0][1]]:t)
  // Now the token-stream is translated recursively.
  function translate(tokens) {
    // helpers : first token to the left of x that is not of a type in the skip list.
    var left = (x=ti-1,skip=[0])=>{ while(x>=0&&~skip.indexOf(tokens[x][0])) x--; return x },
      // first token to the right of x that is not of a type in the skip list.
      right= (x=ti+1,skip=[0])=>{ while(x<tokens.length&&~skip.indexOf(tokens[x][0])) x++; return x },
      // glue from x to y as new type, optionally replace the substring with sub.
      glue = (x,y,tp=6,sub)=>{tokens.splice(x,y-x+1,[tp,...(sub||tokens.slice(x,y+1))])},
      // match O-C pairs. returns the 'matching bracket' position
      match = (O='(',C=')')=>{var o=1,x=ti+1; while(o){if(tokens[x][1]==O)o++;if(tokens[x][1]==C)o--; x++} return x-1}
      // grouping (resolving brackets).
    for (var ti=0,t,si;t=tokens[ti];ti++) if (t[1]=='(') glue(ti,si=match(),7,[[5,'('],...translate(tokens.slice(ti+1,si)),[5,')']])
    // [] dot call and new
    for (var ti=0,t,si; t=tokens[ti];ti++) {
      if (t[1]=='[') { glue(ti,si=match('[',']'),7,[[5,'['],...translate(tokens.slice(ti+1,si)),[5,']']]); if (ti)ti--}    // matching []
      else if (t[1]=='.') { glue(left(),right()); ti-- }                                                                   // dot operator
      else if (t[0]==7 && ti && left()>=0 && tokens[left()][0]>=6 && tokens[left()][1]!='return') { glue(left(),ti--) }     // collate ( and [
      else if (t[1]=='new') { glue(ti,right()) }                                                                           // collate new keyword
    }
    // ++ and --
    for (var ti=0,t; t=tokens[ti];ti++) if (t[1]=='++' || t[1]=='--') glue(left(),ti)
    // unary - and + are handled separately from syntax ..
    for (var ti=0,t,si; t=tokens[ti];ti++)
      if (t[1]=='-' && (left()<0 || (tokens[left()]||[])[1]=='return'||(tokens[left()]||[5])[0]==5)) glue(ti,right(),6,['_Expand(\'Sub\',',tokens[right()],')'])   // unary minus works on all types.
      else if (t[1]=='+' && (left()<0 || (tokens[left()]||[])[1]=='return'|| (tokens[left()]||[0])[0]==5 && (tokens[left()]||[0])[1][0]!='.')) glue(ti,ti+1)                   // unary plus is glued, only on scalars.
      // now process all operators in the syntax list ..
    for (var si=0,s; s=syntax[si]; si++) for (var ti=s[0][3]?tokens.length-1:0,t; t=tokens[ti];s[0][3]?ti--:ti++) for (var opi=0,op; op=s[opi]; opi++) if (t[1]==op[0]) {
      // exception case .. ".Normalized" and ".Length" properties are re-routed (so they work on scalars etc ..)
      if (op[2]==2) { var arg=tokens[left()]; glue(ti-1,ti,6,['_Expand(\''+op[1],'\',',arg,')']) }
      // unary operators (all are to the left)
      else if (op[2])    { var arg=tokens[right()]; glue(ti, right(), 6, ['_Expand(\''+op[1],'\',',arg,')']) }
      // binary operators
      else { var l=left(),r=right(),a1=tokens[l],a2=tokens[r]; if (op[0]==op[1]) glue(l,r,6,[a1,op[1],a2]); else glue(l,r,6,['_Expand(\''+op[1],'\',',a1,',',a2,')']); ti-=2 }
    }
    return tokens
  }
  // Glue all back together and return as bound function.
  return ((function f(t){return t.map(t=>t instanceof Array?f(t):typeof t == 'string'?t:'').join('')})(translate(tok)))
}