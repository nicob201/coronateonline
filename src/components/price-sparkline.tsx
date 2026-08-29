interface PriceSparklineProps {
  prices: number[];
  className?: string;
}

// Inline SVG sparkline that maps a price history array to a polyline path.
function buildPoints(prices: number[]): string {
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min;
  const h = 24;
  const mid = h / 2;
  const step = 100 / (prices.length - 1);

  return prices
    .map((p, i) => {
      const x = i * step;
      const y = range === 0 ? mid : h - ((p - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");
}

export function PriceSparkline({ prices, className }: PriceSparklineProps) {
  if (prices.length < 2) return null;

  return (
    <svg
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      fill="none"
      className={className ?? "w-full h-10"}
    >
      <polyline
        points={buildPoints(prices)}
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        className="text-tertiary"
      />
    </svg>
  );
}
