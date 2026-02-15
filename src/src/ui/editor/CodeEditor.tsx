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
