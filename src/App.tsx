import { useCallback, useState } from 'react';
import { CapturePage } from './pages/CapturePage';
import { HomePage } from './pages/HomePage';
import { ResultsPage } from './pages/ResultsPage';
import type { AppPhase, RoundSummary, ThrowingHand } from './types/round';

export function App() {
  const [phase, setPhase] = useState<AppPhase>('home');
  const [throwingHand, setThrowingHand] = useState<ThrowingHand>('right');
  const [round, setRound] = useState<RoundSummary | null>(null);

  const handleStartRound = useCallback(() => {
    setPhase('capture');
  }, []);

  const handleRoundComplete = useCallback((completedRound: RoundSummary) => {
    setRound(completedRound);
    setPhase('results');
  }, []);

  const handleThrowAgain = useCallback(() => {
    setRound(null);
    setPhase('capture');
  }, []);

  const handleDone = useCallback(() => {
    setRound(null);
    setPhase('home');
  }, []);

  const handleCancelCapture = useCallback(() => {
    setPhase('home');
  }, []);

  return (
    <>
      {phase === 'home' ? (
        <HomePage
          throwingHand={throwingHand}
          onThrowingHandChange={setThrowingHand}
          onStartRound={handleStartRound}
        />
      ) : null}

      {phase === 'capture' ? (
        <CapturePage
          throwingHand={throwingHand}
          onRoundComplete={handleRoundComplete}
          onCancel={handleCancelCapture}
        />
      ) : null}

      {phase === 'results' && round ? (
        <ResultsPage
          round={round}
          onThrowAgain={handleThrowAgain}
          onDone={handleDone}
        />
      ) : null}
    </>
  );
}
