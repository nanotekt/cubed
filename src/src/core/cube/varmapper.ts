/**
 * Variable mapper for CUBE programs.
 * Assigns storage locations to logic variables.
 *
 * Strategy:
 * - Code starts at RAM address 0 and grows upward.
 * - Variables are allocated from RAM address 0x3F downward.
 * - Stack (T, S) used for temporaries in arithmetic.
 */

export const VarLocation = {
  RAM: 'ram',
  STACK: 'stack',
} as const;
export type VarLocation = typeof VarLocation[keyof typeof VarLocation];

export interface VarMapping {
  location: VarLocation;
  ramAddr?: number;     // for RAM-allocated variables
}

export interface VariableMap {
  /** Map from variable name to storage location */
  vars: Map<string, VarMapping>;
  /** Next available RAM address (allocated downward from 0x3F) */
  nextRamAddr: number;
  /** Next available field storage address (allocated upward from 0x20) */
  nextFieldAddr: number;
}

export function mapVariables(variableNames: Set<string>): VariableMap {
  const vars = new Map<string, VarMapping>();
  let nextRamAddr = 0x3F;

  for (const name of variableNames) {
    // Skip internal/synthetic variables
    if (name.startsWith('_')) continue;
    // Skip node directive args
    if (name === 'coord') continue;

    vars.set(name, {
      location: VarLocation.RAM,
      ramAddr: nextRamAddr,
    });
    nextRamAddr--;
  }

  return { vars, nextRamAddr, nextFieldAddr: 0x20 };
}

/** Allocate a contiguous block of RAM for constructor fields. Returns the base address. */
export function allocateFields(varMap: VariableMap, count: number): number {
  const base = varMap.nextFieldAddr;
  varMap.nextFieldAddr += count;
  return base;
}
