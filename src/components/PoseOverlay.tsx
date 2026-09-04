import { forwardRef } from 'react';

export const PoseOverlay = forwardRef<HTMLCanvasElement>(
  function PoseOverlay(_props, ref) {
    return <canvas ref={ref} className="capture__pose-canvas" aria-hidden />;
  },
);
