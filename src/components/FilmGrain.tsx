/**
 * Cinematic film-grain overlay. Layers a static fractal-noise texture
 * on top of whatever is below for that "actual photo / actual film"
 * feel — used on the hero and the new CinematicCollectionCTA so the
 * homepage doesn't look like a generic web page screenshot.
 *
 * Implementation notes:
 * - The texture is a single SVG filter rendered inline (no extra HTTP
 *   request, no canvas, no JS reflow). The browser tiles it at the
 *   chosen `size`, which keeps the GPU happy on long sections.
 * - We only render the noise once and reuse it via a CSS background;
 *   embedding the SVG inline as a data URL keeps it cacheable in the
 *   document and side-steps the cross-origin canvas tainting that a
 *   generated noise canvas would have.
 * - `mix-blend-overlay` lets dark frames stay readable over bright
 *   imagery (the noise is mid-grey and only nudges luminance, not
 *   colour).
 * - Static texture means it's safe under prefers-reduced-motion;
 *   no animation to skip.
 */

interface FilmGrainProps {
  /** 0..1, default 0.06 (subtle). Boost towards 0.1 for hero scenes. */
  opacity?: number;
  /** Tile size in CSS px. Smaller = finer grain. Default 180. */
  size?: number;
  className?: string;
}

const noiseSvg = (size: number) =>
  `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>` +
  `<filter id='n'>` +
  // Fractal noise: high baseFrequency = fine grain; numOctaves > 1
  // gives the noise a bit more variation than pure white noise.
  // stitchTiles avoids visible seams when the texture tiles.
  `<feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/>` +
  // Map the alpha channel down so the texture is mostly transparent
  // and only its highlights show through. Keeps RGB at full white so
  // the overlay reads as luminance noise rather than coloured static.
  `<feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0'/>` +
  `</filter>` +
  `<rect width='100%' height='100%' filter='url(%23n)'/>` +
  `</svg>`;

const FilmGrain = ({
  opacity = 0.06,
  size = 180,
  className = "",
}: FilmGrainProps) => (
  <div
    aria-hidden
    // Sits above the imagery (pointer-events:none so it never traps
    // taps) and below any overlay text. Z-indexes inside the parent
    // section keep the layering correct.
    className={`pointer-events-none absolute inset-0 mix-blend-overlay ${className}`}
    style={{
      opacity,
      backgroundImage: `url("data:image/svg+xml;utf8,${noiseSvg(size)}")`,
      backgroundSize: `${size}px ${size}px`,
      backgroundRepeat: "repeat",
    }}
  />
);

export default FilmGrain;
