import { useEffect, useRef } from 'react';
import type { PoseLandmark } from '../analysis/throwingArm';
import {
  getThrowingArmIndices,
  mapLandmarkToCanvas,
  POSE_CONNECTIONS,
  isThrowingArmConnection,
} from '../analysis/poseDrawing';
import type { ThrowingHand } from '../types/round';

type PoseOverlayProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  landmarks: PoseLandmark[] | null;
  throwingHand: ThrowingHand;
  armTracked: boolean;
  armStable: boolean;
};

export function PoseOverlay({
  videoRef,
  landmarks,
  throwingHand,
  armTracked,
  armStable,
}: PoseOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const throwingJoints = new Set(getThrowingArmIndices(throwingHand));
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      return;
    }

    const draw = () => {
      const rect = video.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!landmarks?.length) {
        return;
      }

      for (const [startIndex, endIndex] of POSE_CONNECTIONS) {
        const start = landmarks[startIndex];
        const end = landmarks[endIndex];
        if (!start || !end) {
          continue;
        }

        const isThrowingArm = isThrowingArmConnection(
          startIndex,
          endIndex,
          throwingHand,
        );
        const startPoint = mapLandmarkToCanvas(
          start,
          video,
          canvas.width,
          canvas.height,
        );
        const endPoint = mapLandmarkToCanvas(
          end,
          video,
          canvas.width,
          canvas.height,
        );

        ctx.beginPath();
        ctx.moveTo(startPoint.x, startPoint.y);
        ctx.lineTo(endPoint.x, endPoint.y);

        if (isThrowingArm && armStable) {
          ctx.strokeStyle = '#5eead4';
          ctx.lineWidth = 5;
        } else if (isThrowingArm && armTracked) {
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 4;
        } else {
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
          ctx.lineWidth = 2;
        }

        ctx.lineCap = 'round';
        ctx.stroke();
      }

      for (const index of throwingJoints) {
        const landmark = landmarks[index];
        if (!landmark) {
          continue;
        }

        const point = mapLandmarkToCanvas(
          landmark,
          video,
          canvas.width,
          canvas.height,
        );

        ctx.beginPath();
        if (armStable) {
          ctx.fillStyle = '#ecfeff';
          ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
        } else if (armTracked) {
          ctx.fillStyle = '#fbbf24';
          ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
        } else {
          ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
          ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    };

    draw();

    const observer = new ResizeObserver(draw);
    observer.observe(video);

    return () => {
      observer.disconnect();
    };
  }, [videoRef, landmarks, throwingHand, armTracked, armStable]);

  return (
    <canvas ref={canvasRef} className="capture__pose-canvas" aria-hidden />
  );
}
