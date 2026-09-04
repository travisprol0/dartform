import type { ThrowingHand } from '../types/round';

type SetupCameraDiagramProps = {
  throwingHand: ThrowingHand;
};

const FLOOR_Y = 94;
const LABEL_Y = 118;

function CheckMark() {
  return (
    <g className="setup-diagram__badge">
      <circle cx="14" cy="14" r="11" fill="#0f766e" />
      <path
        d="M8.5 14.2l3.2 3.2 7.2-7.4"
        fill="none"
        stroke="#5eead4"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

function CrossMark() {
  return (
    <g className="setup-diagram__badge">
      <circle cx="14" cy="14" r="11" fill="#7f1d1d" />
      <path
        d="M9 9l10 10M19 9L9 19"
        fill="none"
        stroke="#f87171"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </g>
  );
}

function SceneLabel({ x, children }: { x: number; children: string }) {
  return (
    <text
      x={x}
      y={LABEL_Y}
      textAnchor="middle"
      fill="#94a3b8"
      fontSize="9"
      fontWeight="600"
      fontFamily="system-ui, sans-serif"
    >
      {children}
    </text>
  );
}

function DartboardOnStand({ cx }: { cx: number }) {
  const cy = 40;
  return (
    <g>
      <line
        x1={cx}
        y1={cy + 12}
        x2={cx}
        y2={FLOOR_Y - 6}
        stroke="#64748b"
        strokeWidth="1.5"
      />
      <line
        x1={cx - 9}
        y1={FLOOR_Y}
        x2={cx + 9}
        y2={FLOOR_Y}
        stroke="#64748b"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <g fill="none" stroke="#94a3b8" strokeWidth="1.3">
        <circle cx={cx} cy={cy} r="11" />
        <circle cx={cx} cy={cy} r="7" />
        <circle cx={cx} cy={cy} r="2.4" fill="#5eead4" stroke="#0f766e" />
      </g>
    </g>
  );
}

function ProfileThrower({
  cx,
  facing,
}: {
  cx: number;
  facing: 'left' | 'right';
}) {
  const dir = facing === 'left' ? -1 : 1;
  const headY = 28;
  const shoulderY = 42;
  const hipY = 60;
  const handX = cx + dir * 24;
  const handY = 32;
  const frontFootX = cx + dir * 5;
  const backFootX = cx - dir * 9;

  return (
    <g fill="none" stroke="#e2e8f0" strokeWidth="2.2" strokeLinecap="round">
      <circle cx={cx} cy={headY} r="7" />
      <path d={`M${cx} ${headY + 7}V${hipY}`} />
      <path d={`M${cx} ${hipY}L${frontFootX} ${FLOOR_Y}`} />
      <path d={`M${cx} ${hipY}L${backFootX} ${FLOOR_Y}`} />
      <path
        d={`M${cx} ${shoulderY}L${handX} ${handY}`}
        stroke="#5eead4"
        strokeWidth="2.8"
      />
      <circle cx={handX} cy={handY} r="2.1" fill="#5eead4" stroke="none" />
    </g>
  );
}

function FrontThrower({ cx }: { cx: number }) {
  return (
    <g fill="none" stroke="#e2e8f0" strokeWidth="2.2" strokeLinecap="round">
      <circle cx={cx} cy={26} r="7" />
      <path d={`M${cx} 33V56`} />
      <path d={`M${cx - 11} 42h22`} />
      <path d={`M${cx} 56L${cx - 8} ${FLOOR_Y}`} />
      <path d={`M${cx} 56L${cx + 8} ${FLOOR_Y}`} />
    </g>
  );
}

function PhoneOnStand({
  x,
  lens,
}: {
  x: number;
  lens: 'left' | 'right' | 'front';
}) {
  const width = 12;
  const height = 20;
  const top = 38;
  const left = x - width / 2;
  const midY = top + height / 2;

  return (
    <g>
      <line
        x1={x}
        y1={top + height}
        x2={x}
        y2={FLOOR_Y - 6}
        stroke="#64748b"
        strokeWidth="1.5"
      />
      <path
        d={`M${x - 11} ${FLOOR_Y}L${x} ${FLOOR_Y - 6}L${x + 11} ${FLOOR_Y}`}
        fill="none"
        stroke="#64748b"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x={left}
        y={top}
        width={width}
        height={height}
        rx="2.2"
        fill="#0f172a"
        stroke="#94a3b8"
        strokeWidth="1.4"
      />
      <rect
        x={left + 2}
        y={top + 3.5}
        width={width - 4}
        height={height - 9}
        rx="1"
        fill="#334155"
      />
      {lens === 'left' ? (
        <circle cx={left} cy={midY} r="1.7" fill="#5eead4" />
      ) : null}
      {lens === 'right' ? (
        <circle cx={left + width} cy={midY} r="1.7" fill="#5eead4" />
      ) : null}
      {lens === 'front' ? (
        <circle cx={x} cy={top + height - 2.2} r="1.7" fill="#f87171" />
      ) : null}
    </g>
  );
}

function SideViewScene({ throwingHand }: { throwingHand: ThrowingHand }) {
  const isLeft = throwingHand === 'left';
  const boardX = isLeft ? 126 : 22;
  const youX = isLeft ? 80 : 68;
  const phoneX = isLeft ? 24 : 124;
  const facing = isLeft ? 'right' : 'left';
  const lens = isLeft ? 'right' : 'left';
  const torsoNear = youX + (isLeft ? -10 : 10);
  const lensX = isLeft ? phoneX + 6 : phoneX - 6;

  const conePoints = isLeft
    ? `${lensX},48 ${torsoNear},34 ${torsoNear},72`
    : `${lensX},48 ${torsoNear},34 ${torsoNear},72`;

  return (
    <g>
      <line
        x1="10"
        y1={FLOOR_Y}
        x2="138"
        y2={FLOOR_Y}
        stroke="#334155"
        strokeWidth="1"
      />
      <DartboardOnStand cx={boardX} />
      <polygon
        points={conePoints}
        fill="rgba(94, 234, 212, 0.2)"
        stroke="#5eead4"
        strokeWidth="1.1"
      />
      <ProfileThrower cx={youX} facing={facing} />
      <PhoneOnStand x={phoneX} lens={lens} />
      <SceneLabel x={boardX}>Board</SceneLabel>
      <SceneLabel x={youX}>You</SceneLabel>
      <SceneLabel x={phoneX}>Phone</SceneLabel>
    </g>
  );
}

function FaceOnScene() {
  const youX = 58;
  const phoneX = 96;

  return (
    <g>
      <line
        x1="10"
        y1={FLOOR_Y}
        x2="138"
        y2={FLOOR_Y}
        stroke="#334155"
        strokeWidth="1"
      />
      <FrontThrower cx={youX} />
      <polygon
        points="90,48 64,30 52,58"
        fill="rgba(248, 113, 113, 0.2)"
        stroke="#f87171"
        strokeWidth="1.1"
      />
      <PhoneOnStand x={phoneX} lens="front" />
      <SceneLabel x={youX}>You</SceneLabel>
      <SceneLabel x={phoneX}>Phone</SceneLabel>
    </g>
  );
}

export function SetupCameraDiagram({ throwingHand }: SetupCameraDiagramProps) {
  const sceneClass =
    throwingHand === 'left'
      ? 'setup-diagram__scene setup-diagram__scene--left'
      : 'setup-diagram__scene setup-diagram__scene--right';

  return (
    <div className="setup-diagram" role="group" aria-label="Camera setup">
      <figure className="setup-diagram__panel">
        <svg
          className="setup-diagram__svg"
          viewBox="0 0 148 126"
          aria-label="Correct: stand the camera beside you so it sees your throwing arm"
        >
          <g className={sceneClass}>
            <SideViewScene throwingHand={throwingHand} />
          </g>
          <CheckMark />
        </svg>
        <figcaption className="setup-diagram__caption">
          Camera at your side
        </figcaption>
      </figure>

      <figure className="setup-diagram__panel">
        <svg
          className="setup-diagram__svg"
          viewBox="0 0 148 126"
          aria-label="Wrong: do not face the camera"
        >
          <g className={sceneClass}>
            <FaceOnScene />
          </g>
          <path
            className="setup-diagram__x"
            d="M22 18l104 92M126 18L22 110"
            fill="none"
            stroke="#f87171"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <CrossMark />
        </svg>
        <figcaption className="setup-diagram__caption">
          Don’t face the camera
        </figcaption>
      </figure>
    </div>
  );
}
