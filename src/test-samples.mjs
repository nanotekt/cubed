/**
 * Quick test script for CUBE parser samples.
 * Run with: cd /c/Users/skmp/projects/cubed/src && npx tsx test-samples.mjs
 */
import { tokenizeCube } from './src/core/cube/tokenizer.ts';
import { parseCube } from './src/core/cube/parser.ts';

// ---------- Sample Programs ----------

const samples = {
  'Lucas Series': `
-- Lucas series: L(0)=2, L(1)=1, L(n)=L(n-1)+L(n-2)
lucas = lambda{n: Int, out: Int}.
  (n = 0 /\ out = 2)
  \/
  (n = 1 /\ out = 1)
  \/
  (minus{a=n, b=1, c=y1} /\
   minus{a=n, b=2, c=y2} /\
   lucas{n=y1, out=y3} /\
   lucas{n=y2, out=y4} /\
   plus{a=y3, b=y4, c=out})
`,

  'Fibonacci': `
-- Fibonacci: fib(0)=0, fib(1)=1, fib(n)=fib(n-1)+fib(n-2)
fib = lambda{n: Int, out: Int}.
  (n = 0 /\ out = 0)
  \/
  (n = 1 /\ out = 1)
  \/
  (greater{a=n, b=1} /\
   minus{a=n, b=1, c=y1} /\
   minus{a=n, b=2, c=y2} /\
   fib{n=y1, out=y3} /\
   fib{n=y2, out=y4} /\
   plus{a=y3, b=y4, c=out})
`,

  'Multi-Node Stack': `
-- Multi-node stack with push/pop using node directives
node 708 /\
push = lambda{val: Int}.
  (f18a.dup /\ f18a.push{a=val})
/\
node 709 /\
pop = lambda{out: Int}.
  (f18a.pop{a=out})
`,

  'Wire Routing': `
-- Wire routing: relay data between adjacent nodes
node 700 /\
source = lambda{val: Int}.
  (val = 42 /\ f18a.right{a=val})
/\
node 701 /\
relay = lambda{x: Int}.
  (f18a.left{a=x} /\ f18a.right{a=x})
/\
node 702 /\
sink = lambda{result: Int}.
  (f18a.left{a=result})
`,

  'RAM Node': `
-- RAM node: store and retrieve values
node 300 /\
store = lambda{addr: Int, val: Int}.
  (f18a.store{a=addr, b=val})
/\
load = lambda{addr: Int, out: Int}.
  (f18a.load{a=addr, b=out})
`,

  'I2C Sensor': `
-- I2C sensor read pattern with start/stop conditions
node 117 /\
i2c_start = lambda{sda: Int, scl: Int}.
  (sda = 1 /\ scl = 1 /\
   f18a.right{a=sda} /\ f18a.down{a=scl})
/\
i2c_read = lambda{addr: Int, data: Int}.
  (i2c_start{sda=y1, scl=y2} /\
   f18a.right{a=addr} /\
   f18a.left{a=data})
/\
node 217 /\
i2c_ack = lambda{ok: Int}.
  (f18a.up{a=ok} /\ ok = 1)
`,

  'Factorial (from docs)': `
-- Factorial from the CUBE language docs
fact = lambda{n: Int, nf: Int}.
  (n = 0 /\ nf = 1)
  \/
  (greater{a=n, b=0} /\
   minus{a=n, b=1, c=y1} /\
   fact{n=y1, nf=y2} /\
   times{a=n, b=y2, c=nf})
`,

  'List Type + Map': `
-- Type definition and higher-order map predicate
List = Lambda{alpha}.
  nil + cons{head: alpha, tail: List}
/\
map = lambda{p: {a: Int, b: Int} -> Int, inp: List, out: List}.
  (inp = nil /\ out = nil)
  \/
  (inp = cons{head=x1, tail=xs1} /\
   out = cons{head=x2, tail=xs2} /\
   p{a=x1, b=x2} /\
   map{p=p, inp=xs1, out=xs2})
`,

  'Port Renaming': `
-- Port renaming example
double = lambda{x: Int, y: Int}.
  (plus{a=x, b=x, c=y})
/\
apply_double = lambda{inp: Int, out: Int}.
  (double{x=inp, y=out})
/\
rename_test = lambda{src: Int, dst: Int}.
  (apply_double{inp=src, out=dst})
`,
};

// ---------- Test Runner ----------

let passed = 0;
let failed = 0;

for (const [name, source] of Object.entries(samples)) {
  process.stdout.write(`Testing: ${name} ... `);

  // Tokenize
  const { tokens, errors: tokErrors } = tokenizeCube(source);
  if (tokErrors.length > 0) {
    console.log('FAIL (tokenizer)');
    for (const err of tokErrors) {
      console.log(`  Tokenizer error at line ${err.line}, col ${err.col}: ${err.message}`);
    }
    failed++;
    continue;
  }

  // Parse
  const { ast, errors: parseErrors } = parseCube(tokens);
  if (parseErrors.length > 0) {
    console.log('FAIL (parser)');
    for (const err of parseErrors) {
      console.log(`  Parse error at line ${err.line}, col ${err.col}: ${err.message}`);
    }
    failed++;
    continue;
  }

  // Verify AST was produced
  if (!ast || ast.kind !== 'program') {
    console.log('FAIL (no AST)');
    failed++;
    continue;
  }

  const itemCount = ast.conjunction.items.length;
  console.log(`OK (${itemCount} top-level items)`);
  passed++;
}

console.log(`\n--- Results: ${passed} passed, ${failed} failed, ${passed + failed} total ---`);

if (failed > 0) {
  process.exit(1);
}
