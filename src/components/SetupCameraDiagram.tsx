import type { ThrowingHand } from '../types/round';

type SetupCameraDiagramProps = {
  throwingHand: ThrowingHand;
};

function CheckMark({ x, y }: { x: number; y: number }) {
  return (
    <g
      className="setup-diagram__badge"
      transform={`translate(${x} ${y})`}
    >
      <circle r="8" fill="#0f766e" />
      <path
        d="M-3.8 0l2.5 2.6 5.3-5.4"
        fill="none"
        stroke="#5eead4"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

function Board() {
  return (
    <g>
      <text
        x="105"
        y="12"
        textAnchor="middle"
        fill="#94a3b8"
        fontSize="7.5"
        fontWeight="700"
        letterSpacing="0.7"
        fontFamily="system-ui, sans-serif"
      >
        BOARD
      </text>
      <g fill="none" stroke="#94a3b8" strokeWidth="1.3">
        <circle cx="105" cy="27" r="11" />
        <circle cx="105" cy="27" r="7" />
        <circle cx="105" cy="27" r="2.4" fill="#5eead4" stroke="#0f766e" />
      </g>
    </g>
  );
}

function ThrowDirection() {
  return (
    <g>
      <line
        x1="105"
        y1="63"
        x2="105"
        y2="43"
        stroke="#5eead4"
        strokeWidth="1.8"
        strokeLinecap="round"
        markerEnd="url(#setup-arrow)"
      />
      <text
        x="119"
        y="55"
        fill="#5eead4"
        fontSize="7.5"
        fontWeight="700"
        letterSpacing="0.5"
        fontFamily="system-ui, sans-serif"
      >
        THROW
      </text>
    </g>
  );
}

function ThrowerFromAbove({ throwingHand }: { throwingHand: ThrowingHand }) {
  const rightArmColor = throwingHand === 'right' ? '#5eead4' : '#94a3b8';
  const leftArmColor = throwingHand === 'left' ? '#5eead4' : '#94a3b8';

  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle
        cx="105"
        cy="72"
        r="7"
        fill="#0f172a"
        stroke="#e2e8f0"
        strokeWidth="2"
      />
      <line
        x1="105"
        y1="79"
        x2="105"
        y2="101"
        stroke="#e2e8f0"
        strokeWidth="2.2"
      />
      <path
        d="M105 101L96 115M105 101l9 14"
        stroke="#e2e8f0"
        strokeWidth="2.2"
      />
      <path
        d="M105 84L92 86 88 101"
        stroke={leftArmColor}
        strokeWidth={throwingHand === 'left' ? 2.8 : 2}
      />
      <path
        d="M105 84l13 2 4 15"
        stroke={rightArmColor}
        strokeWidth={throwingHand === 'right' ? 2.8 : 2}
      />
      <circle
        cx={throwingHand === 'right' ? 122 : 88}
        cy="101"
        r="2"
        fill="#5eead4"
        stroke="none"
      />
      <text
        x="105"
        y="125"
        textAnchor="middle"
        fill="#cbd5e1"
        fontSize="8"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        YOU
      </text>
    </g>
  );
}

function PhonePlacement({ throwingHand }: { throwingHand: ThrowingHand }) {
  const isRight = throwingHand === 'right';
  const side = isRight ? 1 : -1;
  const phoneX = isRight ? 177 : 33;
  const lensX = phoneX - side * 7;
  const bodyEdgeX = 105 + side * 13;
  const conePoints = `${lensX},87 ${bodyEdgeX},66 ${bodyEdgeX},108`;

  return (
    <g>
      <polygon
        points={conePoints}
        fill="rgba(94, 234, 212, 0.16)"
        stroke="#5eead4"
        strokeWidth="1"
      />
      <line
        x1={lensX}
        y1="87"
        x2="105"
        y2="87"
        stroke="#5eead4"
        strokeWidth="1.2"
        strokeDasharray="3 3"
      />
      <rect
        x={phoneX - 7}
        y="74"
        width="14"
        height="26"
        rx="3"
        fill="#0f172a"
        stroke="#5eead4"
        strokeWidth="1.8"
      />
      <rect
        x={phoneX - 4.5}
        y="78"
        width="9"
        height="17"
        rx="1.5"
        fill="#334155"
      />
      <circle cx={lensX} cy="87" r="2" fill="#5eead4" />
      <text
        x={phoneX}
        y="113"
        textAnchor="middle"
        fill="#5eead4"
        fontSize="8"
        fontWeight="800"
        fontFamily="system-ui, sans-serif"
      >
        PHONE HERE
      </text>
      <text
        x={phoneX}
        y="123"
        textAnchor="middle"
        fill="#94a3b8"
        fontSize="7"
        fontWeight="700"
        letterSpacing="0.4"
        fontFamily="system-ui, sans-serif"
      >
        {isRight ? 'RIGHT SIDE' : 'LEFT SIDE'}
      </text>
    </g>
  );
}

function CameraView({ throwingHand }: { throwingHand: ThrowingHand }) {
  const direction = throwingHand === 'right' ? 1 : -1;
  const centerX = 266;
  const handX = centerX + direction * 18;
  const frontFootX = centerX + direction * 5;
  const backFootX = centerX - direction * 8;

  return (
    <g>
      <rect
        x="218"
        y="8"
        width="94"
        height="114"
        rx="7"
        fill="#111c2f"
        stroke="#334155"
      />
      <text
        x="265"
        y="22"
        textAnchor="middle"
        fill="#94a3b8"
        fontSize="7.5"
        fontWeight="700"
        letterSpacing="0.6"
        fontFamily="system-ui, sans-serif"
      >
        CAMERA VIEW
      </text>
      <rect
        x="226"
        y="29"
        width="78"
        height="70"
        rx="4"
        fill="#0f172a"
        stroke="#334155"
      />
      <line
        x1="233"
        y1="91"
        x2="297"
        y2="91"
        stroke="#334155"
        strokeWidth="1"
      />
      <g
        fill="none"
        stroke="#e2e8f0"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx={centerX} cy="45" r="6" />
        <path d={`M${centerX} 51V72`} />
        <path d={`M${centerX} 72L${frontFootX} 91`} />
        <path d={`M${centerX} 72L${backFootX} 91`} />
        <path
          d={`M${centerX} 58L${handX} 50`}
          stroke="#5eead4"
          strokeWidth="2.8"
        />
        <circle cx={handX} cy="50" r="2" fill="#5eead4" stroke="none" />
      </g>
      <CheckMark x={296} y={37} />
      <text
        x="265"
        y="113"
        textAnchor="middle"
        fill="#5eead4"
        fontSize="8"
        fontWeight="800"
        fontFamily="system-ui, sans-serif"
      >
        SIDE PROFILE
      </text>
    </g>
  );
}

export function SetupCameraDiagram({ throwingHand }: SetupCameraDiagramProps) {
  const placementClass =
    throwingHand === 'left'
      ? 'setup-diagram__placement setup-diagram__placement--left'
      : 'setup-diagram__placement setup-diagram__placement--right';
  const throwingSide = `${throwingHand} throwing arm`;

  return (
    <div
      className="setup-diagram"
      role="group"
      aria-label={`Camera setup for a ${throwingHand}-handed thrower`}
    >
      <figure className="setup-diagram__panel">
        <svg
          className="setup-diagram__svg"
          viewBox="0 0 320 130"
          role="img"
          aria-label={`Top view: place the phone directly beside your ${throwingSide}, at a right angle to your throw line, so the camera sees your side profile`}
        >
          <defs>
            <marker
              id="setup-arrow"
              viewBox="0 0 6 6"
              refX="5"
              refY="3"
              markerWidth="5"
              markerHeight="5"
              orient="auto"
            >
              <path d="M0 0l6 3-6 3z" fill="#5eead4" />
            </marker>
          </defs>
          <text
            x="10"
            y="14"
            fill="#94a3b8"
            fontSize="7.5"
            fontWeight="700"
            letterSpacing="0.6"
            fontFamily="system-ui, sans-serif"
          >
            TOP VIEW
          </text>
          <g className={placementClass}>
            <Board />
            <ThrowDirection />
            <PhonePlacement throwingHand={throwingHand} />
            <ThrowerFromAbove throwingHand={throwingHand} />
          </g>
          <line
            x1="211"
            y1="9"
            x2="211"
            y2="121"
            stroke="#334155"
            strokeWidth="1"
          />
          <CameraView throwingHand={throwingHand} />
        </svg>
        <figcaption className="setup-diagram__caption">
          Phone beside your {throwingHand} arm
        </figcaption>
      </figure>
    </div>
  );
}
