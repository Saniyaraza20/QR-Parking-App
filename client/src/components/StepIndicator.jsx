export default function StepIndicator({ steps, currentIndex }) {
  return (
    <div>
      <div className="stepper-label">Step {currentIndex + 1} of {steps.length}: {steps[currentIndex]}</div>
      <div className="stepper" role="progressbar" aria-valuenow={currentIndex + 1} aria-valuemin={1} aria-valuemax={steps.length}>
        {steps.map((label, i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}>
            <div className={`dot ${i < currentIndex ? 'done' : i === currentIndex ? 'current' : ''}`} aria-hidden="true">
              {i < currentIndex ? '\u2713' : i + 1}
            </div>
            {i < steps.length - 1 && <div className={`bar ${i < currentIndex ? 'done' : ''}`} />}
          </div>
        ))}
      </div>
    </div>
  );
}
