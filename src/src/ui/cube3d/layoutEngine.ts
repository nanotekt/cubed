/**
 * Layout engine: transforms a CubeProgram AST into a flat list of
 * positioned 3D objects (SceneGraph) for rendering.
 *
 * Spatial semantics from the CUBE spec:
 *   X axis = conjunction (horizontal AND)
 *   Y axis = disjunction (vertical OR)
 *   Z axis = depth (pipe routing)
 */
import type {
  CubeProgram, Conjunction, ConjunctionItem,
  PredicateDef, Application, Unification, Term, TypeDef,
} from '../../core/cube/ast';

// ---- Scene graph types ----

export type SceneNodeType =
  | 'definition'
  | 'application'
  | 'holder'
  | 'literal'
  | 'port'
  | 'plane'
  | 'constructor'
  | 'type_definition';

export interface PortInfo {
  id: string;
  name: string;
  side: 'left' | 'right' | 'front' | 'back';
  offset: number; // fractional position along that side
  worldPos: [number, number, number];
}

export interface SceneNode {
  id: string;
  type: SceneNodeType;
  label: string;
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  transparent: boolean;
  opacity: number;
  parentId?: string;
  ports: PortInfo[];
}

export interface PipeInfo {
  id: string;
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  fromNodeId?: string;
  toNodeId?: string;
}

export interface SceneGraph {
  nodes: SceneNode[];
  pipes: PipeInfo[];
}

// ---- Color palette ----

const COLORS = {
  builtin: '#4488cc',
  f18a: '#cc8844',
  rom: '#8844cc',
  user: '#44cc88',
  definition: '#22aa66',
  holder: '#66aadd',
  literal: '#ddaa44',
  pipe: '#44dddd',
  plane: '#335533',
  constructor: '#cc44aa',
  type_def: '#aa66cc',
  variant: '#9955bb',
  field: '#bb88dd',
  unknown: '#888888',
};

const BUILTINS = new Set([
  'plus', 'minus', 'times', 'greater', 'not', 'equal',
  'band', 'bor', 'bxor', 'bnot', 'shl', 'shr',
  'send', 'recv',
]);

function appColor(functor: string): string {
  if (BUILTINS.has(functor)) return COLORS.builtin;
  if (functor.startsWith('f18a.')) return COLORS.f18a;
  if (functor.startsWith('rom.')) return COLORS.rom;
  if (functor === '__node') return COLORS.unknown;
  return COLORS.user;
}

// ---- ID generation ----

let idCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}_${idCounter++}`;
}

// ---- Scene graph filtering (for focus/drill-down) ----

/** Collect all descendant node IDs of a given node (recursive via parentId) */
export function getDescendantIds(nodes: SceneNode[], rootId: string): Set<string> {
  const ids = new Set<string>();
  ids.add(rootId);
  let added = true;
  while (added) {
    added = false;
    for (const node of nodes) {
      if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
        ids.add(node.id);
        added = true;
      }
    }
  }
  return ids;
}

/** Filter a scene graph to only include a node and its descendants + connected pipes */
export function filterSceneGraph(sg: SceneGraph, focusId: string): SceneGraph {
  const nodeIds = getDescendantIds(sg.nodes, focusId);

  const filteredNodes = sg.nodes.filter(n => nodeIds.has(n.id));
  const filteredPipes = sg.pipes.filter(p =>
    (p.fromNodeId && nodeIds.has(p.fromNodeId)) ||
    (p.toNodeId && nodeIds.has(p.toNodeId))
  );

  // Re-center around the focused node's position
  const focusNode = sg.nodes.find(n => n.id === focusId);
  if (focusNode) {
    const [ox, oy, oz] = focusNode.position;
    return {
      nodes: filteredNodes.map(n => ({
        ...n,
        position: [n.position[0] - ox, n.position[1] - oy, n.position[2] - oz] as [number, number, number],
        ports: n.ports.map(p => ({
          ...p,
          worldPos: [p.worldPos[0] - ox, p.worldPos[1] - oy, p.worldPos[2] - oz] as [number, number, number],
        })),
      })),
      pipes: filteredPipes.map(p => ({
        ...p,
        from: [p.from[0] - ox, p.from[1] - oy, p.from[2] - oz] as [number, number, number],
        to: [p.to[0] - ox, p.to[1] - oy, p.to[2] - oz] as [number, number, number],
      })),
    };
  }

  return { nodes: filteredNodes, pipes: filteredPipes };
}

// ---- Layout extent (returned by all layout functions) ----

interface LayoutExtent {
  width: number;  // X extent
  depth: number;  // Z extent
}

// ---- Layout constants ----

const ITEM_SPACING_X = 2.5;
const ITEM_SPACING_Z = 1.0;  // gap between items in Z within a nested conjunction
const TOP_LEVEL_SPACING_Z = 1.5; // extra gap between top-level items
const CLAUSE_SPACING_Y = 2.0;
const DEF_PADDING = 0.5;
const DEF_DEPTH_PAD = 0.5; // Z padding around content inside containers
const APP_SIZE = 1.0;
const HOLDER_SIZE = 0.5;
const LITERAL_SIZE = 0.6;
const PORT_SIZE = 0.25;

// ---- Main entry point ----

export function layoutAST(program: CubeProgram): SceneGraph {
  idCounter = 0;
  const nodes: SceneNode[] = [];
  const pipes: PipeInfo[] = [];
  const holderPositions = new Map<string, [number, number, number]>();
  const holderNodeIds = new Map<string, string>(); // variable name → node id

  // Collect constructor names from type definitions for coloring
  const constructorNames = new Set<string>();
  for (const item of program.conjunction.items) {
    if (item.kind === 'type_def') {
      for (const variant of item.variants) {
        constructorNames.add(variant.name);
      }
    }
  }

  layoutConjunction(program.conjunction, [0, 0, 0], nodes, pipes, holderPositions, holderNodeIds, undefined, constructorNames, true);

  return { nodes, pipes };
}

// ---- Conjunction layout ----
// Top-level: items along Z (depth), each definition gets its own row.
// Nested (inside a predicate clause): items along X (horizontal AND),
// with each item offset in Z by the cumulative depth of prior items.

function layoutConjunction(
  conj: Conjunction,
  origin: [number, number, number],
  nodes: SceneNode[],
  pipes: PipeInfo[],
  holderPositions: Map<string, [number, number, number]>,
  holderNodeIds: Map<string, string>,
  parentId?: string,
  constructorNames?: Set<string>,
  topLevel: boolean = false,
): LayoutExtent {
  if (topLevel) {
    // Top-level: lay items out along Z axis to avoid overlap
    let zCursor = origin[2];
    for (const item of conj.items) {
      const ext = layoutItem(item, [origin[0], origin[1], zCursor], nodes, pipes, holderPositions, holderNodeIds, parentId, constructorNames);
      zCursor += ext.depth + TOP_LEVEL_SPACING_Z;
    }
    return { width: 0, depth: zCursor - origin[2] };
  }

  // Nested: lay items along X axis. Each item is offset in Z by the
  // cumulative depth of the preceding items so pipes route around objects.
  let xCursor = origin[0];
  let totalDepth = 0;

  for (let i = 0; i < conj.items.length; i++) {
    const item = conj.items[i];
    // Alternate Z: even items at current Z, odd items pushed forward
    const zOff = (i % 2 === 1) ? ITEM_SPACING_Z : 0;
    const ext = layoutItem(item, [xCursor, origin[1], origin[2] + zOff], nodes, pipes, holderPositions, holderNodeIds, parentId, constructorNames);
    xCursor += ext.width + ITEM_SPACING_X;
    // Track the maximum Z extent (item depth + its Z offset)
    totalDepth = Math.max(totalDepth, zOff + ext.depth);
  }

  return {
    width: xCursor - origin[0] - ITEM_SPACING_X,
    depth: totalDepth,
  };
}

// ---- Single item dispatch ----

function layoutItem(
  item: ConjunctionItem,
  pos: [number, number, number],
  nodes: SceneNode[],
  pipes: PipeInfo[],
  holderPositions: Map<string, [number, number, number]>,
  holderNodeIds: Map<string, string>,
  parentId?: string,
  constructorNames?: Set<string>,
): LayoutExtent {
  switch (item.kind) {
    case 'predicate_def':
      return layoutPredicateDef(item, pos, nodes, pipes, holderPositions, holderNodeIds, parentId, constructorNames);
    case 'application':
      return layoutApplication(item, pos, nodes, pipes, holderPositions, holderNodeIds, parentId, constructorNames);
    case 'unification':
      return layoutUnification(item, pos, nodes, pipes, holderPositions, holderNodeIds, parentId, constructorNames);
    case 'type_def':
      return layoutTypeDef(item, pos, nodes, parentId);
  }
}

// ---- Predicate definition ----

function layoutPredicateDef(
  def: PredicateDef,
  origin: [number, number, number],
  nodes: SceneNode[],
  pipes: PipeInfo[],
  _holderPositions: Map<string, [number, number, number]>,
  _holderNodeIds: Map<string, string>,
  parentId?: string,
  constructorNames?: Set<string>,
): LayoutExtent {
  const defId = nextId('def');
  const clauseNodes: SceneNode[][] = [];
  const clausePipes: PipeInfo[][] = [];
  let maxClauseWidth = 0;
  let maxClauseDepth = 0;

  // Each predicate def gets its own scoped variable maps
  // so variables don't leak between sibling definitions
  const localHolderPositions = new Map<string, [number, number, number]>();
  const localHolderNodeIds = new Map<string, string>();

  // Layout each clause (disjunction stacked on Y)
  for (let i = 0; i < def.clauses.length; i++) {
    const clauseSceneNodes: SceneNode[] = [];
    const clauseScenePipes: PipeInfo[] = [];
    const clauseY = origin[1] - i * CLAUSE_SPACING_Y;
    const innerOrigin: [number, number, number] = [
      origin[0] + DEF_PADDING,
      clauseY,
      origin[2],
    ];

    const ext = layoutConjunction(
      def.clauses[i], innerOrigin, clauseSceneNodes, clauseScenePipes, localHolderPositions, localHolderNodeIds, defId, constructorNames,
    );
    maxClauseWidth = Math.max(maxClauseWidth, ext.width);
    maxClauseDepth = Math.max(maxClauseDepth, ext.depth);
    clauseNodes.push(clauseSceneNodes);
    clausePipes.push(clauseScenePipes);

    // Plane box for this clause (Z sized to content depth)
    const planeId = nextId('plane');
    const planeDepth = ext.depth + DEF_DEPTH_PAD;
    nodes.push({
      id: planeId,
      type: 'plane',
      label: `clause ${i + 1}`,
      position: [
        innerOrigin[0] + ext.width / 2 - APP_SIZE / 2,
        clauseY,
        origin[2] + planeDepth / 2,
      ],
      size: [ext.width + DEF_PADDING, 1.2, planeDepth + APP_SIZE],
      color: COLORS.plane,
      transparent: true,
      opacity: 0.15,
      parentId: defId,
      ports: [],
    });
  }

  // Outer definition box
  const totalWidth = maxClauseWidth + DEF_PADDING * 2;
  const totalHeight = def.clauses.length * CLAUSE_SPACING_Y + DEF_PADDING;
  const contentDepth = maxClauseDepth + DEF_DEPTH_PAD * 2;

  // Build ports from params
  const ports: PortInfo[] = def.params.map((p, i) => {
    const frac = def.params.length > 1 ? i / (def.params.length - 1) : 0.5;
    const portWorldPos: [number, number, number] = [
      origin[0] - PORT_SIZE,
      origin[1] - frac * (totalHeight - 1),
      origin[2],
    ];
    return {
      id: nextId('port'),
      name: p.name,
      side: 'left' as const,
      offset: frac,
      worldPos: portWorldPos,
    };
  });

  // Register param names as holder positions (for pipe inference within this def)
  for (const port of ports) {
    localHolderPositions.set(port.name, port.worldPos);
  }

  nodes.push({
    id: defId,
    type: 'definition',
    label: def.name,
    position: [
      origin[0] + totalWidth / 2 - APP_SIZE / 2,
      origin[1] - totalHeight / 2 + 0.5,
      origin[2] + contentDepth / 2,
    ],
    size: [totalWidth, totalHeight, contentDepth + APP_SIZE],
    color: COLORS.definition,
    transparent: true,
    opacity: 0.2,
    parentId,
    ports,
  });

  // Add all clause nodes and pipes
  for (const cn of clauseNodes) nodes.push(...cn);
  for (const cp of clausePipes) pipes.push(...cp);

  return { width: totalWidth, depth: contentDepth + APP_SIZE };
}

// ---- Type Definition ----

const VARIANT_SIZE = 0.8;
const FIELD_SIZE = 0.5;
const VARIANT_SPACING_Y = 1.4;
const FIELD_SPACING_X = 1.2;

function layoutTypeDef(
  typeDef: TypeDef,
  origin: [number, number, number],
  nodes: SceneNode[],
  parentId?: string,
): LayoutExtent {
  const defId = nextId('typedef');
  let maxVariantWidth = 0;

  // Layout each variant stacked on Y (sum type = disjunction)
  for (let vi = 0; vi < typeDef.variants.length; vi++) {
    const variant = typeDef.variants[vi];
    const variantY = origin[1] - vi * VARIANT_SPACING_Y;
    const isNullary = variant.fields.length === 0;

    // Variant constructor node
    const variantId = nextId('variant');
    const variantPos: [number, number, number] = [
      origin[0] + DEF_PADDING,
      variantY,
      origin[2],
    ];

    nodes.push({
      id: variantId,
      type: 'constructor',
      label: variant.name,
      position: variantPos,
      size: [VARIANT_SIZE, VARIANT_SIZE, VARIANT_SIZE],
      color: COLORS.constructor,
      transparent: isNullary,
      opacity: isNullary ? 0.7 : 1,
      parentId: defId,
      ports: [],
    });

    let variantWidth = VARIANT_SIZE;

    // Layout fields horizontally (product type = conjunction)
    for (let fi = 0; fi < variant.fields.length; fi++) {
      const field = variant.fields[fi];
      const fieldPos: [number, number, number] = [
        origin[0] + DEF_PADDING + VARIANT_SIZE / 2 + FIELD_SPACING_X * (fi + 1),
        variantY,
        origin[2],
      ];
      const fieldId = nextId('field');

      const typeLabel = field.type.kind === 'type_var' ? field.type.name
        : field.type.kind === 'type_app' ? field.type.constructor
        : '?';

      nodes.push({
        id: fieldId,
        type: 'holder',
        label: `${field.name}: ${typeLabel}`,
        position: fieldPos,
        size: [FIELD_SIZE, FIELD_SIZE, FIELD_SIZE],
        color: COLORS.field,
        transparent: true,
        opacity: 0.6,
        parentId: defId,
        ports: [],
      });

      variantWidth = FIELD_SPACING_X * (fi + 1) + FIELD_SIZE;
    }

    maxVariantWidth = Math.max(maxVariantWidth, variantWidth);
  }

  // Outer type definition box
  const totalWidth = maxVariantWidth + DEF_PADDING * 2;
  const totalHeight = Math.max(typeDef.variants.length * VARIANT_SPACING_Y, 1.0);

  const typeDefDepth = 1.2;
  nodes.push({
    id: defId,
    type: 'type_definition',
    label: typeDef.name,
    position: [
      origin[0] + totalWidth / 2 - APP_SIZE / 2,
      origin[1] - totalHeight / 2 + VARIANT_SPACING_Y / 2,
      origin[2],
    ],
    size: [totalWidth, totalHeight, typeDefDepth],
    color: COLORS.type_def,
    transparent: true,
    opacity: 0.15,
    parentId,
    ports: [],
  });

  return { width: totalWidth, depth: typeDefDepth };
}

// ---- Application ----

function layoutApplication(
  app: Application,
  pos: [number, number, number],
  nodes: SceneNode[],
  pipes: PipeInfo[],
  holderPositions: Map<string, [number, number, number]>,
  holderNodeIds: Map<string, string>,
  parentId?: string,
  constructorNames?: Set<string>,
): LayoutExtent {
  if (app.functor === '__node') return { width: 0, depth: 0 }; // node directive is invisible

  const isConstructor = constructorNames?.has(app.functor) ?? false;
  const appId = nextId(isConstructor ? 'ctor' : 'app');
  const color = isConstructor ? COLORS.constructor : appColor(app.functor);

  // Build ports from args
  const ports: PortInfo[] = app.args.map((arg, i) => {
    const side: 'left' | 'right' = i % 2 === 0 ? 'right' : 'left';
    const row = Math.floor(i / 2);
    const totalRows = Math.ceil(app.args.length / 2);
    const frac = totalRows > 1 ? row / (totalRows - 1) : 0.5;
    const xOff = side === 'right' ? APP_SIZE / 2 + PORT_SIZE : -APP_SIZE / 2 - PORT_SIZE;
    const yOff = (0.5 - frac) * APP_SIZE * 0.8;
    const portPos: [number, number, number] = [
      pos[0] + xOff,
      pos[1] + yOff,
      pos[2],
    ];
    return {
      id: nextId('port'),
      name: arg.name,
      side,
      offset: frac,
      worldPos: portPos,
    };
  });

  nodes.push({
    id: appId,
    type: isConstructor ? 'constructor' : 'application',
    label: app.functor,
    position: pos,
    size: [APP_SIZE, APP_SIZE, APP_SIZE],
    color,
    transparent: false,
    opacity: 1,
    parentId,
    ports,
  });

  // Layout arg values (holders, literals) and create pipes
  // Use appId as parent so arg terms become children of this application
  for (let i = 0; i < app.args.length; i++) {
    const arg = app.args[i];
    const port = ports[i];
    layoutTermForPort(arg.value, port, appId, pos, nodes, pipes, holderPositions, holderNodeIds, appId, constructorNames);
  }

  return { width: APP_SIZE, depth: APP_SIZE };
}

// ---- Unification ----

function layoutUnification(
  uni: Unification,
  pos: [number, number, number],
  nodes: SceneNode[],
  pipes: PipeInfo[],
  holderPositions: Map<string, [number, number, number]>,
  holderNodeIds: Map<string, string>,
  parentId?: string,
  constructorNames?: Set<string>,
): LayoutExtent {
  // Left holder for the variable
  const holderId = nextId('holder');
  const holderPos: [number, number, number] = [pos[0], pos[1], pos[2]];

  nodes.push({
    id: holderId,
    type: 'holder',
    label: uni.variable,
    position: holderPos,
    size: [HOLDER_SIZE, HOLDER_SIZE, HOLDER_SIZE],
    color: COLORS.holder,
    transparent: true,
    opacity: 0.5,
    parentId,
    ports: [],
  });

  holderPositions.set(uni.variable, holderPos);
  holderNodeIds.set(uni.variable, holderId);

  // Right side: the term
  const termPos: [number, number, number] = [pos[0] + 1.5, pos[1], pos[2]];
  const termNodeId = layoutTerm(uni.term, termPos, nodes, pipes, holderPositions, holderNodeIds, parentId, constructorNames);

  // Pipe from holder to term
  pipes.push({
    id: nextId('pipe'),
    from: holderPos,
    to: termPos,
    color: COLORS.pipe,
    fromNodeId: holderId,
    toNodeId: termNodeId ?? undefined,
  });

  return { width: 1.5 + HOLDER_SIZE, depth: HOLDER_SIZE };
}

// ---- Term layout (for standalone terms) ----

/** Returns the node ID of the created node (or null if no node was created) */
function layoutTerm(
  term: Term,
  pos: [number, number, number],
  nodes: SceneNode[],
  pipes: PipeInfo[],
  holderPositions: Map<string, [number, number, number]>,
  holderNodeIds: Map<string, string>,
  parentId?: string,
  constructorNames?: Set<string>,
): string | null {
  switch (term.kind) {
    case 'var': {
      // Check if this is a nullary constructor (e.g. `true`, `nil`)
      if (constructorNames?.has(term.name)) {
        const ctorId = nextId('ctor');
        nodes.push({
          id: ctorId,
          type: 'constructor',
          label: term.name,
          position: pos,
          size: [LITERAL_SIZE, LITERAL_SIZE, LITERAL_SIZE],
          color: COLORS.constructor,
          transparent: false,
          opacity: 1,
          parentId,
          ports: [],
        });
        return ctorId;
      }
      const existing = holderPositions.get(term.name);
      if (existing) {
        // Pipe to existing holder
        const existingNodeId = holderNodeIds.get(term.name);
        pipes.push({ id: nextId('pipe'), from: pos, to: existing, color: COLORS.pipe, toNodeId: existingNodeId });
        return existingNodeId ?? null;
      }
      // New holder
      const holderId = nextId('holder');
      nodes.push({
        id: holderId,
        type: 'holder',
        label: term.name,
        position: pos,
        size: [HOLDER_SIZE, HOLDER_SIZE, HOLDER_SIZE],
        color: COLORS.holder,
        transparent: true,
        opacity: 0.5,
        parentId,
        ports: [],
      });
      holderPositions.set(term.name, pos);
      holderNodeIds.set(term.name, holderId);
      return holderId;
    }
    case 'literal': {
      const litId = nextId('lit');
      nodes.push({
        id: litId,
        type: 'literal',
        label: String(term.value),
        position: pos,
        size: [LITERAL_SIZE, LITERAL_SIZE, LITERAL_SIZE],
        color: COLORS.literal,
        transparent: false,
        opacity: 1,
        parentId,
        ports: [],
      });
      return litId;
    }
    case 'app_term': {
      // Treat as inline application
      const inlineApp: Application = {
        kind: 'application',
        functor: term.functor,
        args: term.args,
        loc: term.loc,
      };
      layoutApplication(inlineApp, pos, nodes, pipes, holderPositions, holderNodeIds, parentId, constructorNames);
      // The application node was just added as the last node
      return nodes[nodes.length - 1]?.id ?? null;
    }
    case 'rename':
      return null; // Rename terms are structural, not visual
  }
}

// ---- Layout a term attached to a port (creates pipe) ----

function layoutTermForPort(
  term: Term,
  port: PortInfo,
  appNodeId: string,
  parentPos: [number, number, number],
  nodes: SceneNode[],
  pipes: PipeInfo[],
  holderPositions: Map<string, [number, number, number]>,
  holderNodeIds: Map<string, string>,
  parentId?: string,
  constructorNames?: Set<string>,
): void {
  const offset = port.side === 'right' ? 1.2 : -1.2;
  const termPos: [number, number, number] = [
    parentPos[0] + offset,
    port.worldPos[1],
    parentPos[2],
  ];

  switch (term.kind) {
    case 'var': {
      // Check if this is a nullary constructor
      if (constructorNames?.has(term.name)) {
        const ctorId = nextId('ctor');
        nodes.push({
          id: ctorId,
          type: 'constructor',
          label: term.name,
          position: termPos,
          size: [LITERAL_SIZE, LITERAL_SIZE, LITERAL_SIZE],
          color: COLORS.constructor,
          transparent: false,
          opacity: 1,
          parentId,
          ports: [],
        });
        pipes.push({ id: nextId('pipe'), from: port.worldPos, to: termPos, color: COLORS.pipe, fromNodeId: appNodeId, toNodeId: ctorId });
        break;
      }
      const existing = holderPositions.get(term.name);
      if (existing) {
        // Pipe from port to existing holder
        const existingNodeId = holderNodeIds.get(term.name);
        pipes.push({ id: nextId('pipe'), from: port.worldPos, to: existing, color: COLORS.pipe, fromNodeId: appNodeId, toNodeId: existingNodeId });
      } else {
        // New holder
        const holderId = nextId('holder');
        nodes.push({
          id: holderId,
          type: 'holder',
          label: term.name,
          position: termPos,
          size: [HOLDER_SIZE, HOLDER_SIZE, HOLDER_SIZE],
          color: COLORS.holder,
          transparent: true,
          opacity: 0.5,
          parentId,
          ports: [],
        });
        holderPositions.set(term.name, termPos);
        holderNodeIds.set(term.name, holderId);
        pipes.push({ id: nextId('pipe'), from: port.worldPos, to: termPos, color: COLORS.pipe, fromNodeId: appNodeId, toNodeId: holderId });
      }
      break;
    }
    case 'literal': {
      const litId = nextId('lit');
      nodes.push({
        id: litId,
        type: 'literal',
        label: String(term.value),
        position: termPos,
        size: [LITERAL_SIZE, LITERAL_SIZE, LITERAL_SIZE],
        color: COLORS.literal,
        transparent: false,
        opacity: 1,
        parentId,
        ports: [],
      });
      pipes.push({ id: nextId('pipe'), from: port.worldPos, to: termPos, color: COLORS.pipe, fromNodeId: appNodeId, toNodeId: litId });
      break;
    }
    case 'app_term': {
      const inlineApp: Application = {
        kind: 'application',
        functor: term.functor,
        args: term.args,
        loc: term.loc,
      };
      layoutApplication(inlineApp, termPos, nodes, pipes, holderPositions, holderNodeIds, parentId, constructorNames);
      const inlineAppNodeId = nodes[nodes.length - 1]?.id;
      pipes.push({ id: nextId('pipe'), from: port.worldPos, to: termPos, color: COLORS.pipe, fromNodeId: appNodeId, toNodeId: inlineAppNodeId });
      break;
    }
    case 'rename':
      break;
  }
}
