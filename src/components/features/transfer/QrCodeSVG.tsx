interface QrCodeSVGProps {
  matrix: boolean[][];
}

export function QrCodeSVG({ matrix }: QrCodeSVGProps) {
  const size = matrix.length || 1;
  const cellSize = 100 / size;

  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
      <rect x="0" y="0" width="100" height="100" rx="10" fill="currentColor" opacity="0.08" />
      {matrix.map((row, y) =>
        row.map((isFilled, x) =>
          isFilled ? (
            <rect
              key={`${x}-${y}`}
              x={x * cellSize}
              y={y * cellSize}
              width={cellSize}
              height={cellSize}
              fill="currentColor"
            />
          ) : null
        )
      )}
    </svg>
  );
}
