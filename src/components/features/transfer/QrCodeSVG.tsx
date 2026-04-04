interface QrCodeSVGProps {
  matrix: boolean[][];
}

export function QrCodeSVG({ matrix }: QrCodeSVGProps) {
  const size = matrix.length || 1;
  const cellSize = 100 / size;
  const inset = Math.min(cellSize * 0.12, 0.16);
  const drawSize = Math.max(cellSize - inset * 2, 0.35);

  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
      {matrix.map((row, y) =>
        row.map((isFilled, x) =>
          isFilled ? (
            <rect
              key={`${x}-${y}`}
              x={x * cellSize + inset}
              y={y * cellSize + inset}
              width={drawSize}
              height={drawSize}
              rx={Math.min(drawSize * 0.25, 0.55)}
              fill="currentColor"
            />
          ) : null
        )
      )}
    </svg>
  );
}
