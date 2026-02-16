import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Box, Typography, Chip, TextField } from '@mui/material';

interface VgaDisplayProps {
  ioWrites: number[];
}

/** Convert 9-bit DAC value (3:3:3 RGB) to CSS color string */
function dacToRgb(value: number): string {
  const r = ((value >> 6) & 0x7) * 255 / 7 | 0;
  const g = ((value >> 3) & 0x7) * 255 / 7 | 0;
  const b = (value & 0x7) * 255 / 7 | 0;
  return `rgb(${r},${g},${b})`;
}

export const VgaDisplay: React.FC<VgaDisplayProps> = ({ ioWrites }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastDrawnRef = useRef(0);
  const [pixelWidth, setPixelWidth] = useState(4);
  const [pixelScale, setPixelScale] = useState(12);

  // Full redraw helper
  const fullRedraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < ioWrites.length; i++) {
      const col = i % pixelWidth;
      const row = Math.floor(i / pixelWidth);
      ctx.fillStyle = dacToRgb(ioWrites[i] & 0x1FF);
      ctx.fillRect(col * pixelScale, row * pixelScale, pixelScale, pixelScale);
    }
    lastDrawnRef.current = ioWrites.length;
  }, [ioWrites, pixelWidth, pixelScale]);

  // Detect buffer reset (length decreases) — clear and redraw
  useEffect(() => {
    if (ioWrites.length < lastDrawnRef.current) {
      lastDrawnRef.current = 0;
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx && canvasRef.current) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
  }, [ioWrites.length]);

  // Incremental draw: only new pixels since last render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const start = lastDrawnRef.current;
    const end = ioWrites.length;
    if (start >= end) return;

    for (let i = start; i < end; i++) {
      const col = i % pixelWidth;
      const row = Math.floor(i / pixelWidth);
      ctx.fillStyle = dacToRgb(ioWrites[i] & 0x1FF);
      ctx.fillRect(col * pixelScale, row * pixelScale, pixelScale, pixelScale);
    }
    lastDrawnRef.current = end;
  }, [ioWrites, ioWrites.length, pixelWidth, pixelScale]);

  // Redraw everything when width/scale change
  useEffect(() => {
    lastDrawnRef.current = 0;
    fullRedraw();
  }, [pixelWidth, pixelScale, fullRedraw]);

  const totalPixels = ioWrites.length;
  const rows = Math.max(1, Math.ceil(totalPixels / pixelWidth));
  const canvasWidth = pixelWidth * pixelScale;
  const canvasHeight = rows * pixelScale;

  return (
    <Box sx={{ backgroundColor: '#0a0a0a', border: '1px solid #333', borderRadius: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, borderBottom: '1px solid #222' }}>
        <Typography variant="caption" sx={{ color: '#888', fontWeight: 'bold', fontSize: '10px' }}>
          VGA Output
        </Typography>
        <Chip label={`${totalPixels} px`} size="small" sx={{ fontSize: '9px', height: 18 }} />
        <Typography variant="caption" sx={{ color: '#555', fontSize: '9px' }}>W:</Typography>
        <TextField
          type="number"
          size="small"
          value={pixelWidth}
          onChange={(e) => setPixelWidth(Math.max(1, parseInt(e.target.value) || 4))}
          slotProps={{ htmlInput: { min: 1, max: 640 } }}
          sx={{ width: 48, '& input': { fontSize: '10px', py: 0.25, px: 0.5, color: '#ccc' }, '& fieldset': { borderColor: '#444' } }}
        />
        <Typography variant="caption" sx={{ color: '#555', fontSize: '9px' }}>Scale:</Typography>
        <TextField
          type="number"
          size="small"
          value={pixelScale}
          onChange={(e) => setPixelScale(Math.max(1, Math.min(32, parseInt(e.target.value) || 12)))}
          slotProps={{ htmlInput: { min: 1, max: 32 } }}
          sx={{ width: 40, '& input': { fontSize: '10px', py: 0.25, px: 0.5, color: '#ccc' }, '& fieldset': { borderColor: '#444' } }}
        />
      </Box>
      <Box sx={{ overflow: 'auto', maxHeight: 300, p: 0.5 }}>
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          style={{ display: 'block', backgroundColor: '#000', imageRendering: 'pixelated' }}
        />
      </Box>
    </Box>
  );
};
