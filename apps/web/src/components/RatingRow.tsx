/**
 * One question: eight numbered buttons that act as a radio group. Every
 * question is optional, so clicking the chosen number again clears it.
 */
export function RatingRow({
  label,
  low,
  high,
  value,
  onChange,
}: {
  label: string;
  low: string;
  high: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm">{label}</legend>
      <div role="radiogroup" aria-label={label} className="mt-2 grid grid-cols-8 gap-1">
        {Array.from({ length: 8 }, (_, index) => index + 1).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(value === n ? null : n)}
            // No colour transition: a picked number should show at once.
            className={`h-9 cursor-pointer rounded-md border font-mono text-sm outline-offset-2 outline-walnut focus-visible:outline-2 ${
              value === n ? "border-walnut bg-walnut text-paper" : "border-stone bg-paper hover:bg-linen"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-taupe">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </fieldset>
  );
}
