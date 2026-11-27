import { useDecember } from '@/hooks/useDecember';

const bulbs = Array.from({ length: 12 }, (_, index) => index);

/** A decorative string with the wreath centered between the two halves. */
export function ChristmasLights() {
  const isDecember = useDecember();
  if (!isDecember) return null;

  return <div aria-hidden="true" className="christmas-garland mx-auto w-full max-w-5xl">
    <div className="christmas-garland-string">
      <div className="christmas-garland-side">{bulbs.map(index => <span key={index} className="christmas-light" />)}</div>
      <div className="christmas-garland-side">{bulbs.map(index => <span key={index} className="christmas-light" />)}</div>
    </div>
    <img src="/images/christmas-wreath.webp" alt="" className="christmas-wreath" />
  </div>;
}
