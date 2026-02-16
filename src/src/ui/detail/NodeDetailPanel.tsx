import React from 'react';
import { Box, Paper, Typography, Tabs, Tab, Chip } from '@mui/material';
import type { NodeSnapshot } from '../../core/types';
import type { SourceMapEntry } from '../../core/cube/emitter';
import { RegisterView } from './RegisterView';
import { StackView } from './StackView';
import { MemoryView } from './MemoryView';
import { NODE_COLORS } from '../theme';

interface NodeDetailPanelProps {
  node: NodeSnapshot | null;
  sourceMap?: SourceMapEntry[] | null;
}

export const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({ node, sourceMap }) => {
  const [tab, setTab] = React.useState(0);

  if (!node) {
    return (
      <Paper elevation={2} sx={{ p: 2, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" sx={{ color: '#666' }}>
          Click a node to inspect
        </Typography>
      </Paper>
    );
  }

  const stateColor = NODE_COLORS[node.state] || NODE_COLORS.suspended;

  // Find current CUBE source location from source map
  const cubeLocation = sourceMap ? findCubeLocation(sourceMap, node.registers.P) : null;

  return (
    <Paper elevation={2} sx={{ p: 1, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
          Node {node.coord.toString().padStart(3, '0')}
        </Typography>
        <Chip
          label={node.state.replace('_', ' ')}
          size="small"
          sx={{ backgroundColor: stateColor, color: '#fff', fontSize: '10px', height: 20 }}
        />
        {node.currentReadingPort && (
          <Chip label={`reading ${node.currentReadingPort}`} size="small" variant="outlined" sx={{ fontSize: '9px', height: 18 }} />
        )}
        {node.currentWritingPort && (
          <Chip label={`writing ${node.currentWritingPort}`} size="small" variant="outlined" sx={{ fontSize: '9px', height: 18 }} />
        )}
        <Typography variant="caption" sx={{ color: '#666', ml: 'auto' }}>
          steps: {node.stepCount}
        </Typography>
      </Box>

      {/* CUBE source location indicator */}
      {cubeLocation && (
        <Box sx={{
          mb: 1,
          px: 1,
          py: 0.5,
          backgroundColor: 'rgba(136, 255, 136, 0.1)',
          borderLeft: '3px solid #88ff88',
          borderRadius: '0 4px 4px 0',
        }}>
          <Typography variant="caption" sx={{ color: '#88ff88', fontSize: '10px', fontFamily: 'monospace' }}>
            CUBE: {cubeLocation.label}
          </Typography>
          <Typography variant="caption" sx={{ color: '#666', fontSize: '9px', ml: 1 }}>
            (line {cubeLocation.line})
          </Typography>
        </Box>
      )}

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ minHeight: 28, mb: 1, '& .MuiTab-root': { minHeight: 28, py: 0, fontSize: '11px' } }}
      >
        <Tab label="Registers" />
        <Tab label="Stacks" />
        <Tab label="Memory" />
      </Tabs>

      {tab === 0 && <RegisterView registers={node.registers} slotIndex={node.slotIndex} />}
      {tab === 1 && <StackView dstack={node.dstack} rstack={node.rstack} />}
      {tab === 2 && <MemoryView ram={node.ram} rom={node.rom} pc={node.registers.P} />}
    </Paper>
  );
};

function findCubeLocation(sourceMap: SourceMapEntry[], pc: number): SourceMapEntry | null {
  // Find the source map entry whose addr is <= pc (the most recent one before this address)
  let best: SourceMapEntry | null = null;
  for (const entry of sourceMap) {
    if (entry.addr <= pc) {
      if (!best || entry.addr > best.addr) {
        best = entry;
      }
    }
  }
  return best;
}
