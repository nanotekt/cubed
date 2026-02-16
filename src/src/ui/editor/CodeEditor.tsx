import React, { useRef, useCallback, useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import type { OnMount } from '@monaco-editor/react';
import { Box, Select, MenuItem, type SelectChangeEvent } from '@mui/material';
import { registerArrayForthLanguage } from './arrayforthLang';
import { registerCubeLanguage } from './cubeLang';
import type { CompileError } from '../../core/types';

const DEFAULT_ARRAYFORTH = `\\ GA144 Port Execution Example
\\ Node 609 acts as a slave memory array
\\ Node 608 stores values via port execution

node 609
: main r---

node 608
: set ( a )
    @p ! ! ;
    .. @p a! ..
: @next ( -n )
    @p ! @ ;
    .. @+ !p ..
: !next ( n )
    @p ! ! ;
    .. @p !+ ..
: fetch ( a-n ) set @next ;
: store ( na ) set !next ;

: main
 right a!

 0
 10 for
    dup dup . +
    over
    store
    1 . +
 next
`;

const CUBE_SAMPLES: Record<string, string> = {

'MD5 Hash': `-- MD5 Hash on GA144 (AN001)
-- Models the multi-node MD5 pipeline from the GreenArrays
-- application note using CUBE's concurrent dataflow semantics.
--
-- Nodes 205/105: bitwise round functions
-- Nodes 206/106: constant fetch + add + rotate
-- Nodes 204/104: message buffer with index computation

-- f'(x,y,z) = (x AND y) OR (NOT(x) AND z)
md5f = lambda{x:Int, y:Int, z:Int, r:Int}.
  (f18a.and{} /\\ f18a.xor{})

/\\

-- g'(x,y,z) = (x AND z) OR (y AND NOT(z))
md5g = lambda{x:Int, y:Int, z:Int, r:Int}.
  (f18a.and{} /\\ f18a.xor{})

/\\

-- h'(x,y,z) = x XOR y XOR z
md5h = lambda{x:Int, y:Int, z:Int, r:Int}.
  (f18a.xor{} /\\ f18a.xor{})

/\\

-- i'(x,y,z) = y XOR (x OR NOT(z))
md5i = lambda{x:Int, y:Int, z:Int, r:Int}.
  (f18a.xor{} /\\ f18a.xor{})

/\\

-- One MD5 step: out = b + (a + f(b,c,d) + msg + k)
-- Rotation omitted for clarity (handled by nodes 206/106)
md5step = lambda{a:Int, b:Int, c:Int, d:Int,
                  msg:Int, kon:Int, out:Int}.
  (md5f{x=b, y=c, z=d, r=fval} /\\
   plus{a=a, b=fval, c=s1} /\\
   plus{a=s1, b=msg, c=s2} /\\
   plus{a=s2, b=kon, c=s3} /\\
   plus{a=s3, b=b, c=out})

/\\

-- Compute first MD5 step on empty message
-- Initial digest: A=0x67452301 B=0xEFCDAB89
--                 C=0x98BADCFE D=0x10325476
-- T[0] = 0xD76AA478 (low 16 bits)
md5step{a=0x2301, b=0xAB89, c=0xDCFE,
        d=0x5476, msg=128, kon=0xA478,
        out=result}
`,

'Feature Demo': `-- CUBE Language Feature Demonstration
-- Showcases: type definitions, constructors, pattern matching,
-- multi-clause predicates, multidirectional builtins, guards,
-- and Hindley-Milner type inference.

-- ============================================================
-- 1. TYPE DEFINITIONS
-- ============================================================

-- Bool: a sum type with two nullary constructors.
-- Compiler assigns tag 0 to 'true', tag 1 to 'false'.
Bool = Lambda{}. true + false

/\\

-- Pair: a product type with two Int fields.
-- Fields stored in RAM; descriptor encodes base address.
Pair = Lambda{}. pair{fst: Int, snd: Int}

/\\

-- ============================================================
-- 2. MULTI-CLAUSE with CONSTRUCTOR MATCHING
-- ============================================================

-- bool_to_int: converts Bool -> Int via pattern matching.
-- Each clause discriminates on the constructor tag.
bool_to_int = lambda{b:Bool, n:Int}.
  (b = true /\\ n = 1
   \\/
   b = false /\\ n = 0)

/\\

-- ============================================================
-- 3. MULTI-CLAUSE with LITERAL MATCHING + GUARDS
-- ============================================================

-- Factorial: base case (n=0) and recursive case with guard.
-- Uses multidirectional 'times' (forward: c = a * b).
fact = lambda{n:Int, r:Int}.
  (n = 0 /\\ r = 1
   \\/
   greater{a=n, b=0} /\\
   minus{a=n, b=1, c=n1} /\\
   fact{n=n1, r=r1} /\\
   times{a=n, b=r1, c=r})

/\\

-- ============================================================
-- 4. MULTIDIRECTIONAL BUILTINS (reverse mode)
-- ============================================================

-- Reverse-mode plus: given c=10 and b=3, solve for a.
-- Compiler generates: a = c - b = 7
plus{a=x, b=3, c=10}

/\\

-- Reverse-mode minus: given a=20 and c=15, solve for b.
-- Compiler generates: b = a - c = 5
minus{a=20, b=y, c=15}

/\\

-- ============================================================
-- 5. CONSTRUCTOR APPLICATION + PATTERN MATCHING
-- ============================================================

-- Build a Bool, convert it to Int, then make a Pair
myval = true

/\\

bool_to_int{b=myval, n=intval}

/\\

p = pair{fst=intval, snd=42}

/\\

-- ============================================================
-- 6. EQUALITY CHECK (both args known -> check mode)
-- ============================================================

-- Verifies intval == 1 (since myval = true -> intval = 1).
-- Emits XOR + conditional branch; halts on mismatch.
equal{a=intval, b=1}
`,

'MD5 Multi-Node': `-- MD5 Multi-Node Hash (AN001 Partner Pattern)
-- Low-16 partner node: handles bits 0-15 of 32-bit values.
-- Sends carry to high-16 partner via UP port after accumulation.
--
-- Architecture (GreenArrays AN001):
--   Node 205 (this): low 16 bits, sends carry up
--   Node 305:        high 16 bits, receives carry from below
--
-- Uses: type definitions, multi-clause dispatch, bitwise builtins,
--       port I/O for inter-node carry propagation.

node 205

/\\

-- Round function selector (sum type → pattern-matched dispatch)
RoundType = Lambda{}. fround + ground + hround + iround

/\\

-- MD5 F(x,y,z) = (x AND y) OR (NOT x AND z)
-- Used in rounds 0-15
md5f = lambda{x:Int, y:Int, z:Int, r:Int}.
  (band{a=x, b=y, c=xy} /\\
   bnot{a=x, b=nx} /\\
   band{a=nx, b=z, c=nxz} /\\
   bor{a=xy, b=nxz, c=r})

/\\

-- MD5 G(x,y,z) = (x AND z) OR (y AND NOT z)
-- Used in rounds 16-31
md5g = lambda{x:Int, y:Int, z:Int, r:Int}.
  (band{a=x, b=z, c=xz} /\\
   bnot{a=z, b=nz} /\\
   band{a=y, b=nz, c=ynz} /\\
   bor{a=xz, b=ynz, c=r})

/\\

-- MD5 H(x,y,z) = x XOR y XOR z
-- Used in rounds 32-47
md5h = lambda{x:Int, y:Int, z:Int, r:Int}.
  (bxor{a=x, b=y, c=xy} /\\
   bxor{a=xy, b=z, c=r})

/\\

-- MD5 I(x,y,z) = y XOR (x OR NOT z)
-- Used in rounds 48-63
md5i = lambda{x:Int, y:Int, z:Int, r:Int}.
  (bnot{a=z, b=nz} /\\
   bor{a=x, b=nz, c=xnz} /\\
   bxor{a=y, b=xnz, c=r})

/\\

-- Round function dispatch: pattern match on RoundType tag
roundfn = lambda{rtype:RoundType, x:Int, y:Int, z:Int, r:Int}.
  (rtype = fround /\\ md5f{x=x, y=y, z=z, r=r}
   \\/
   rtype = ground /\\ md5g{x=x, y=y, z=z, r=r}
   \\/
   rtype = hround /\\ md5h{x=x, y=y, z=z, r=r}
   \\/
   rtype = iround /\\ md5i{x=x, y=y, z=z, r=r})

/\\

-- One MD5 step on the low-16 partner node:
--   1. Compute round function f(b,c,d)
--   2. Accumulate: temp = a + f + msg + constant
--   3. Extract carry (bits 16-17), send to high partner
--   4. Mask to 16 bits, add b for final result
md5step = lambda{a:Int, b:Int, c:Int, d:Int,
                  msg:Int, kon:Int, rtype:RoundType, out:Int}.
  (roundfn{rtype=rtype, x=b, y=c, z=d, r=fval} /\\
   plus{a=a, b=fval, c=s1} /\\
   plus{a=s1, b=msg, c=s2} /\\
   plus{a=s2, b=kon, c=s3} /\\
   shr{a=s3, n=16, c=carry} /\\
   send{port=0x145, value=carry} /\\
   band{a=s3, b=0xFFFF, c=masked} /\\
   plus{a=masked, b=b, c=out})

/\\

-- Execute first MD5 F-round step on empty message
-- Initial MD5 state (low 16 bits of standard IV):
--   A=0x2301  B=0xAB89  C=0xDCFE  D=0x5476
-- T[0] low 16 bits = 0xA478
-- Message word M[0] = 0x0080 (padding bit for empty input)
rt = fround

/\\

md5step{a=0x2301, b=0xAB89, c=0xDCFE, d=0x5476,
        msg=0x0080, kon=0xA478, rtype=rt, out=result}
`,

'SHA-256': `-- SHA-256 Hash (Multi-Node, AN001 Partner Pattern)
-- Low-16 partner node: handles bits 0-15 of 32-bit values.
-- Sends carry to high-16 partner via UP port.
--
-- SHA-256 uses four auxiliary functions per round:
--   Ch(e,f,g)  = (e AND f) XOR (NOT e AND g)
--   Maj(a,b,c) = (a AND b) XOR (a AND c) XOR (b AND c)
--   Sigma0(a)  = ROTR2(a) XOR ROTR13(a) XOR ROTR22(a)
--   Sigma1(e)  = ROTR6(e) XOR ROTR11(e) XOR ROTR25(e)
--
-- On 18-bit F18A nodes, rotation is decomposed into
-- shifts on the low-16 partner; the high-16 partner
-- supplies the wrapped bits via port communication.

node 205

/\\

-- Ch(e, f, g) = (e AND f) XOR (NOT(e) AND g)
-- "Choice": e selects between f and g
sha_ch = lambda{e:Int, f:Int, g:Int, r:Int}.
  (band{a=e, b=f, c=ef} /\\
   bnot{a=e, b=ne} /\\
   band{a=ne, b=g, c=neg} /\\
   bxor{a=ef, b=neg, c=r})

/\\

-- Maj(a, b, c) = (a AND b) XOR (a AND c) XOR (b AND c)
-- "Majority": result bit is 1 if at least 2 of a,b,c are 1
sha_maj = lambda{a:Int, b:Int, c:Int, r:Int}.
  (band{a=a, b=b, c=ab} /\\
   band{a=a, b=c, c=ac} /\\
   band{a=b, b=c, c=bc} /\\
   bxor{a=ab, b=ac, c=t1} /\\
   bxor{a=t1, b=bc, c=r})

/\\

-- Sigma0(a) = ROTR2(a) XOR ROTR13(a) XOR ROTR22(a)
-- Low-16 approximation: use shifts, receive wrapped bits from partner
sha_sigma0 = lambda{a:Int, r:Int}.
  (shr{a=a, n=2, c=r2} /\\
   recv{port=0x145, value=wrap2} /\\
   bor{a=r2, b=wrap2, c=rot2} /\\
   shr{a=a, n=13, c=r13} /\\
   recv{port=0x145, value=wrap13} /\\
   bor{a=r13, b=wrap13, c=rot13} /\\
   bxor{a=rot2, b=rot13, c=t1} /\\
   shr{a=a, n=6, c=r6} /\\
   recv{port=0x145, value=wrap6} /\\
   bor{a=r6, b=wrap6, c=rot22} /\\
   bxor{a=t1, b=rot22, c=r})

/\\

-- Sigma1(e) = ROTR6(e) XOR ROTR11(e) XOR ROTR25(e)
sha_sigma1 = lambda{e:Int, r:Int}.
  (shr{a=e, n=6, c=r6} /\\
   recv{port=0x145, value=wrap6} /\\
   bor{a=r6, b=wrap6, c=rot6} /\\
   shr{a=e, n=11, c=r11} /\\
   recv{port=0x145, value=wrap11} /\\
   bor{a=r11, b=wrap11, c=rot11} /\\
   bxor{a=rot6, b=rot11, c=t1} /\\
   shr{a=e, n=9, c=r9} /\\
   recv{port=0x145, value=wrap9} /\\
   bor{a=r9, b=wrap9, c=rot25} /\\
   bxor{a=t1, b=rot25, c=r})

/\\

-- One SHA-256 compression step (low 16 bits):
--   T1 = h + Sigma1(e) + Ch(e,f,g) + K + W
--   T2 = Sigma0(a) + Maj(a,b,c)
--   Send carries to high partner, mask to 16 bits
sha_step = lambda{a:Int, b:Int, c:Int, d:Int,
                   e:Int, f:Int, g:Int, h:Int,
                   w:Int, k:Int, newd:Int, newh:Int}.
  (sha_sigma1{e=e, r=sig1} /\\
   sha_ch{e=e, f=f, g=g, r=ch} /\\
   plus{a=h, b=sig1, c=s1} /\\
   plus{a=s1, b=ch, c=s2} /\\
   plus{a=s2, b=k, c=s3} /\\
   plus{a=s3, b=w, c=t1} /\\
   shr{a=t1, n=16, c=carry1} /\\
   send{port=0x145, value=carry1} /\\
   band{a=t1, b=0xFFFF, c=t1m} /\\
   sha_sigma0{a=a, r=sig0} /\\
   sha_maj{a=a, b=b, c=c, r=maj} /\\
   plus{a=sig0, b=maj, c=t2} /\\
   shr{a=t2, n=16, c=carry2} /\\
   send{port=0x145, value=carry2} /\\
   band{a=t2, b=0xFFFF, c=t2m} /\\
   plus{a=d, b=t1m, c=newd} /\\
   plus{a=t1m, b=t2m, c=newh})

/\\

-- Execute first SHA-256 round on empty message
-- Initial hash (low 16 bits of SHA-256 IV):
--   a=0xE667  b=0xAE85  c=0xF372  d=0xF53A
--   e=0x6B17  f=0xBB67  c2=0xC1B0  d2=0x5BE0
-- K[0] low 16 = 0x2F98, W[0] = 0x0000 (first word of padded empty msg)
sha_step{a=0xE667, b=0xAE85, c=0xF372, d=0xF53A,
         e=0x6B17, f=0xBB67, g=0xC1B0, h=0x5BE0,
         w=0x8000, k=0x2F98, newd=nd, newh=nh}
`,

'Lucas Series': `-- Lucas Series Generator (from lucas-series.aforth)
-- Two-node pipeline: node 608 generates Lucas numbers,
-- node 708 reads and outputs them via serial.
--
-- Lucas sequence: 2, 1, 3, 4, 7, 11, 18, 29, ...
-- Like Fibonacci but starts with L(0)=2, L(1)=1.
--
-- In the reference, node 608 computes and sends values
-- north to node 708 which prints them over serial.

node 608

/\\

-- Generate the next Lucas number from the previous two.
-- L(n) = L(n-1) + L(n-2)
lucas_next = lambda{prev2:Int, prev1:Int, result:Int}.
  plus{a=prev2, b=prev1, c=result}

/\\

-- Send value to the serial output node above
lucas_send = lambda{val:Int}.
  send{port=0x145, value=val}

/\\

-- Compute 6 steps of the Lucas sequence
-- Starting: L(0)=2, L(1)=1

-- Step 0: send L(0)
lucas_send{val=2}

/\\

-- Step 1: send L(1)
lucas_send{val=1}

/\\

-- Step 2: L(2) = 2 + 1 = 3
lucas_next{prev2=2, prev1=1, result=l2}
/\\ lucas_send{val=l2}

/\\

-- Step 3: L(3) = 1 + 3 = 4
lucas_next{prev2=1, prev1=l2, result=l3}
/\\ lucas_send{val=l3}

/\\

-- Step 4: L(4) = 3 + 4 = 7
lucas_next{prev2=l2, prev1=l3, result=l4}
/\\ lucas_send{val=l4}

/\\

-- Step 5: L(5) = 4 + 7 = 11
lucas_next{prev2=l3, prev1=l4, result=l5}
/\\ lucas_send{val=l5}
`,

'Fibonacci': `-- Fibonacci Sequence (from test-print.aforth)
-- Single-node iterative Fibonacci computation.
--
-- In the reference, node 0 computes Fib values using
-- the over-over-add pattern on the F18A stack.
-- Here we model each step as explicit dataflow.

node 0

/\\

-- One Fibonacci step: given F(n-1) and F(n-2), produce F(n)
fib_step = lambda{a:Int, b:Int, next:Int}.
  plus{a=a, b=b, c=next}

/\\

-- Unroll 10 iterations of the Fibonacci sequence
-- F(0)=1, F(1)=1
fib_step{a=1, b=1, c=f2}

/\\

-- F(3) = F(2) + F(1)
fib_step{a=1, b=f2, c=f3}

/\\

-- F(4) = F(3) + F(2)
fib_step{a=f2, b=f3, c=f4}

/\\

-- F(5) = F(4) + F(3)
fib_step{a=f3, b=f4, c=f5}

/\\

-- F(6) = F(5) + F(4)
fib_step{a=f4, b=f5, c=f6}

/\\

-- F(7) = F(6) + F(5)
fib_step{a=f5, b=f6, c=f7}

/\\

-- F(8) = F(7) + F(6)
fib_step{a=f6, b=f7, c=f8}

/\\

-- F(9) = F(8) + F(7)
fib_step{a=f7, b=f8, c=f9}

/\\

-- F(10) = F(9) + F(8)
fib_step{a=f8, b=f9, c=f10}
`,

'Multi-Node Stack': `-- Multi-Node Stack (from stack.aforth)
-- Two-node distributed stack: node 1 stores values in RAM,
-- node 0 sends push/pop commands via port communication.
--
-- In the reference, node 1 uses its 64-word RAM as a stack
-- with address auto-decrement. Node 0 issues push/pop
-- commands through the east/west port boundary.
--
-- This models the logical data flow of push and pop
-- operations between client and storage nodes.

node 0

/\\

-- Operation type for stack commands
StackOp = Lambda{}. push_op + pop_op

/\\

-- Push: send value to storage node via east port (0x1D5)
stack_push = lambda{val:Int}.
  send{port=0x1D5, value=val}

/\\

-- Pop: receive value from storage node via east port
stack_pop = lambda{val:Int}.
  recv{port=0x1D5, value=val}

/\\

-- Push three values: 1, 2, 3
stack_push{val=1}
/\\ stack_push{val=2}
/\\ stack_push{val=3}

/\\

-- Pop three values (should come back as 3, 2, 1)
stack_pop{val=v1}
/\\ stack_pop{val=v2}
/\\ stack_pop{val=v3}

/\\

-- Push one more
stack_push{val=5}
`,

'Wire Routing': `-- Wire Routing Chain (from counter.aforth)
-- Models the GA144 "wire node" pattern where intermediate
-- nodes relay data between distant nodes on the chip.
--
-- In the reference, nodes 714-710 each run a simple
-- wire loop: read from east, write to west.
-- This creates a 5-hop data relay from node 715 (crystal)
-- to node 709 (counter/serial output).
--
-- Pattern: each wire node does @ !b wire (read, write, repeat)
-- This is fundamental to GA144 programming since nodes
-- can only talk to direct neighbors.

-- Source node: generates values
node 715

/\\

-- Wire relay function: read from one port, write to another.
-- Models the F18A pattern: east a! west b! @ !b (loop)
wire_relay = lambda{inp:Int, out:Int}.
  (recv{port=0x1D5, value=inp} /\\
   send{port=0x175, value=inp} /\\
   out = inp)

/\\

-- Simple value passthrough (identity relay)
wire_pass = lambda{val:Int, out:Int}.
  out = val

/\\

-- 5 chained wire nodes relay a value from east to west
-- Node 714: relay east->west
wire_relay{inp=hop1, out=r1}

/\\

-- Node 713: relay
wire_relay{inp=hop2, out=r2}

/\\

-- Node 712: relay
wire_relay{inp=hop3, out=r3}

/\\

-- Node 711: relay
wire_relay{inp=hop4, out=r4}

/\\

-- Node 710: relay
wire_relay{inp=hop5, out=r5}

/\\

-- Source: send initial value (crystal counter tick)
send{port=0x175, value=42}
`,

'RAM Node': `-- Fast RAM Node (from fast-ram-node.aforth)
-- Two-node memory system: node 1 provides 61-word random
-- access storage, node 0 is the client that reads/writes.
--
-- In the reference, node 1's code is minimal:
--   @b -> if negative: negate to get address, set A, read @, send !b
--   if positive: negate to get address, set A, read value @b, store !
-- The sign bit of the address encodes read vs write.
--
-- This models the logical read/write protocol between
-- a client node and a RAM node via port communication.

node 0

/\\

-- Write command: send negated address then value to RAM node
-- In F18A, negative address = write, positive = read
ram_write = lambda{addr:Int, val:Int}.
  (minus{a=0, b=addr, c=neg_addr} /\\
   send{port=0x1D5, value=neg_addr} /\\
   send{port=0x1D5, value=val})

/\\

-- Read command: send positive address, receive value
ram_read = lambda{addr:Int, val:Int}.
  (send{port=0x1D5, value=addr} /\\
   recv{port=0x1D5, value=val})

/\\

-- Store three values at addresses 5, 3, 59
ram_write{addr=5, val=55}

/\\

ram_write{addr=3, val=2}

/\\

ram_write{addr=59, val=88}

/\\

-- Read them back
ram_read{addr=3, val=v1}

/\\

ram_read{addr=59, val=v2}

/\\

ram_read{addr=5, val=v3}
`,

'I2C Sensor': `-- I2C Sensor Bus (from sensortag.aforth / AN012)
-- Models the I2C protocol primitives used by the GA144
-- sensor tag application note. Three cooperating nodes:
--   Node 709: timing (pulls SCL high/low via DAC)
--   Node 708: bit-banged I2C master (clock + data)
--   Node 707: sensor register initialization sequences
--
-- I2C protocol:
--   START: SDA high->low while SCL high
--   STOP:  SDA low->high while SCL high
--   BIT:   Set SDA, pulse SCL, read ACK

node 708

/\\

-- I2C bus state
I2CState = Lambda{}. idle + start + data + stop

/\\

-- Send a single bit: set data line, pulse clock
-- The clock node (709) handles SCL timing via DAC
i2c_send_bit = lambda{bit:Int, state:I2CState}.
  (shl{a=bit, n=1, c=data_pin} /\\
   bor{a=data_pin, b=0x20000, c=io_val} /\\
   send{port=0x1D5, value=io_val})

/\\

-- Send START condition: SDA goes low while SCL is high
-- In F18A: set SDA=1, SCL=1, then SDA=0 while SCL stays high
i2c_start = lambda{}.
  (send{port=0x1D5, value=0x30000} /\\
   send{port=0x1D5, value=0x20000})

/\\

-- Send STOP condition: SDA goes high while SCL is high
i2c_stop = lambda{}.
  (send{port=0x1D5, value=0x20000} /\\
   send{port=0x1D5, value=0x30000})

/\\

-- Send one byte (8 bits) MSB first, receive ACK
-- Shift out each bit, then read ACK from slave
i2c_send_byte = lambda{byte:Int, ack:Int}.
  (shr{a=byte, n=7, c=b7} /\\
   i2c_send_bit{bit=b7, state=data} /\\
   shr{a=byte, n=6, c=b6t} /\\
   band{a=b6t, b=1, c=b6} /\\
   i2c_send_bit{bit=b6, state=data} /\\
   shr{a=byte, n=5, c=b5t} /\\
   band{a=b5t, b=1, c=b5} /\\
   i2c_send_bit{bit=b5, state=data} /\\
   shr{a=byte, n=4, c=b4t} /\\
   band{a=b4t, b=1, c=b4} /\\
   i2c_send_bit{bit=b4, state=data} /\\
   recv{port=0x1D5, value=ack})

/\\

-- Write to an I2C sensor register:
-- START, send device address + W, send register, send value, STOP
i2c_write_reg = lambda{dev:Int, reg:Int, val:Int}.
  (shl{a=dev, n=1, c=addr_w} /\\
   i2c_start{} /\\
   i2c_send_byte{byte=addr_w, ack=ack1} /\\
   i2c_send_byte{byte=reg, ack=ack2} /\\
   i2c_send_byte{byte=val, ack=ack3} /\\
   i2c_stop{})

/\\

-- Configure TMP006 temperature sensor (device 0x40):
-- Write 0x7100 to config register 0x02
-- (continuous conversion, 16 samples averaged)
i2c_write_reg{dev=0x40, reg=0x02, val=0x71}
`,

};

const CUBE_SAMPLE_NAMES = Object.keys(CUBE_SAMPLES);

const DEFAULT_CUBE = CUBE_SAMPLES['MD5 Hash'];

export type EditorLanguage = 'arrayforth' | 'cube';

interface CodeEditorProps {
  language: EditorLanguage;
  onCompile: (source: string) => void;
  onSourceChange?: (source: string) => void;
  errors: CompileError[];
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ language, onCompile, onSourceChange, errors }) => {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const languagesRegistered = useRef(false);
  const onCompileRef = useRef(onCompile);
  onCompileRef.current = onCompile;
  const [selectedSample, setSelectedSample] = useState(CUBE_SAMPLE_NAMES[0]);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    if (!languagesRegistered.current) {
      registerArrayForthLanguage(monaco);
      registerCubeLanguage(monaco);
      languagesRegistered.current = true;
    }

    const model = editor.getModel();
    if (model) monaco.editor.setModelLanguage(model, language);

    // Ctrl+Enter to compile (use ref to avoid stale closure)
    editor.addAction({
      id: 'compile',
      label: 'Compile & Load',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => {
        const source = editor.getValue();
        onCompileRef.current(source);
      },
    });
  }, [language]);

  // Switch language when prop changes
  useEffect(() => {
    if (monacoRef.current && editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        monacoRef.current.editor.setModelLanguage(model, language);
      }
      // Set default source for the language
      const currentSource = editorRef.current.getValue();
      const isDefault = Object.values(CUBE_SAMPLES).includes(currentSource) ||
        currentSource === DEFAULT_ARRAYFORTH || currentSource === '';
      if (isDefault) {
        editorRef.current.setValue(language === 'cube' ? DEFAULT_CUBE : DEFAULT_ARRAYFORTH);
      }
    }
  }, [language]);

  // Handle sample selection
  const handleSampleChange = useCallback((event: SelectChangeEvent) => {
    const name = event.target.value;
    setSelectedSample(name);
    const sample = CUBE_SAMPLES[name];
    if (sample && editorRef.current) {
      editorRef.current.setValue(sample);
    }
  }, []);

  // Update error markers
  useEffect(() => {
    if (monacoRef.current && editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        const markers = errors.map(err => ({
          severity: monacoRef.current.MarkerSeverity.Error,
          message: err.message,
          startLineNumber: err.line || 1,
          startColumn: err.col || 1,
          endLineNumber: err.line || 1,
          endColumn: (err.col || 1) + 10,
        }));
        monacoRef.current.editor.setModelMarkers(model, 'compiler', markers);
      }
    }
  }, [errors]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {language === 'cube' && (
        <Box sx={{ px: 1, py: 0.5, borderBottom: '1px solid #333', flexShrink: 0 }}>
          <Select
            value={selectedSample}
            onChange={handleSampleChange}
            size="small"
            variant="standard"
            sx={{
              color: '#ccc',
              fontSize: 12,
              '& .MuiSelect-icon': { color: '#888' },
              '&:before': { borderColor: '#555' },
            }}
          >
            {CUBE_SAMPLE_NAMES.map(name => (
              <MenuItem key={name} value={name} sx={{ fontSize: 12 }}>
                {name}
              </MenuItem>
            ))}
          </Select>
        </Box>
      )}
      <Box sx={{ flex: 1, border: '1px solid #333' }}>
        <Editor
          height="100%"
          defaultLanguage={language}
          defaultValue={language === 'cube' ? DEFAULT_CUBE : DEFAULT_ARRAYFORTH}
          theme="vs-dark"
          onMount={handleMount}
          onChange={(value) => onSourceChange?.(value ?? '')}
          options={{
            fontSize: 13,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            minimap: { enabled: false },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'off',
            tabSize: 2,
            renderWhitespace: 'none',
          }}
        />
      </Box>
    </Box>
  );
};
