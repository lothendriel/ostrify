import { useDecember } from '@/hooks/useDecember';

const bulbs = Array.from({ length: 24 }, (_, index) => index);

/** A decorative string with the wreath centered between the two halves. */
export function ChristmasLights() {
  const isDecember = useDecember();
  if (!isDecember) return null;

  return <div aria-hidden="true" className="christmas-garland mx-auto w-full max-w-5xl">
    <div className="christmas-garland-string">
      {bulbs.map(index => <span key={index} className="christmas-light" />)}
    </div>
    <img src="/images/christmas-wreath.webp" alt="" className="christmas-wreath" />
  </div>;
}
