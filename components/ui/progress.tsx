interface ProgressProps {
  value: number;
  className?: string;
}

export function Progress({ value, className }: ProgressProps) {
  return (
    <div className={`progress ${className}`}>
      <div className="progress-bar" style={{ width: `${value}%` }}></div>
    </div>
  );
}
