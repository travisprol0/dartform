import type { ThrowingHand } from '../types/round';
import { throwingHandLabel } from '../analysis/throwingArm';

type HomePageProps = {
  throwingHand: ThrowingHand;
  onThrowingHandChange: (hand: ThrowingHand) => void;
  onStartRound: () => void;
};

export function HomePage({
  throwingHand,
  onThrowingHandChange,
  onStartRound,
}: HomePageProps) {
  const armLabel = throwingHandLabel(throwingHand);

  return (
    <main className="page page--centered page--home">
      <div className="page-inner">
        <h1 className="title">DartForm</h1>
        <p className="subtitle">
          Analyze your throw mechanics across three darts.
        </p>

        <section className="section">
          <p className="section-label">Throwing hand</p>
          <div className="toggle-row">
            <button
              type="button"
              className={`toggle-button ${throwingHand === 'right' ? 'toggle-button--active' : ''}`}
              onClick={() => onThrowingHandChange('right')}
            >
              Right
            </button>
            <button
              type="button"
              className={`toggle-button ${throwingHand === 'left' ? 'toggle-button--active' : ''}`}
              onClick={() => onThrowingHandChange('left')}
            >
              Left
            </button>
          </div>
        </section>

        <div className="setup-box">
          <h2 className="setup-title">Setup</h2>
          <p className="setup-body setup-body--phone">
            Place the phone on your throwing side so the camera sees your{' '}
            {armLabel} arm in profile. Use a tripod or stable surface, then
            throw all three darts.
          </p>
          <p className="setup-body setup-body--note setup-body--phone">
            Rotate to landscape when the camera opens.
          </p>
          <p className="setup-body setup-body--desktop">
            Stand so the camera sees your {armLabel} arm in profile, then throw
            all three darts.
          </p>
        </div>

        <button type="button" className="primary-button" onClick={onStartRound}>
          Throw 3 darts
        </button>
      </div>
    </main>
  );
}
