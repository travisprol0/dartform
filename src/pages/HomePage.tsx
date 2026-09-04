import type { ThrowingHand } from '../types/round';
import { throwingHandLabel } from '../analysis/throwingArm';
import { SetupCameraDiagram } from '../components/SetupCameraDiagram';

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
      <div className="page-inner home-layout">
        <header className="home-layout__intro">
          <h1 className="title">DartForm</h1>
          <p className="subtitle">
            Analyze your throw mechanics across three darts.
          </p>
        </header>

        <section className="section home-layout__hand">
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

        <div className="setup-box home-layout__setup">
          <h2 className="setup-title">Setup</h2>
          <SetupCameraDiagram throwingHand={throwingHand} />
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

        <button
          type="button"
          className="primary-button home-layout__cta"
          onClick={onStartRound}
        >
          Throw 3 darts
        </button>
      </div>
    </main>
  );
}
