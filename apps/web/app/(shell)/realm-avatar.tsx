import { useId, type CSSProperties } from "react";
import { CULTIVATION_LADDER } from "@training-sanctum/domain";

/**
 * The realm avatar: a cultivator portrait drawn in SVG, one look per realm of
 * the ladder (19 realms, Ngưng Khí to Đạp Thiên Cảnh). Silver hair, a dark
 * robe with trim, and a glowing background in the realm's colours. The
 * portrait gains a layer at fixed steps, so a higher realm always reads as
 * stronger:
 *
 *   1 Trúc Cơ      aura behind the body
 *   2 Kết Đan      the core (golden pill) at the belt, spirit motes
 *   3 Nguyên Anh   a ring around the core, a billowing cape
 *   4 Hóa Thần     formation circle behind the head, pauldrons, rim
 *   7 Âm Hư        a vortex behind the head, two flying swords
 *   9 Khuy Niết    four swords (Bộ 2), lightning in the sky
 *  10 Tịnh Niết    the formation circle doubles and turns
 *  13 Không Niết   rays, third eye, glowing eyes, six swords (Bộ 3)
 *  16 Không Kiếp   crown, eight swords, a dragon coiled around
 *  18 Đạp Thiên Cảnh  gold figure on black, full radiance (Bộ 4)
 *
 * It moves: a halo pulses outside the circle (stronger with the realm), the
 * aura and core breathe, hair and cape sway, swords hover, motes rise and
 * lightning flickers (keyframes `ra-*` in globals.css). Under reduced motion
 * every piece rests in a visible pose.
 *
 * Decorative only: it never carries information the label does not.
 */

interface Palette {
  /** Background, centre of the radial gradient. */
  inner: string;
  /** Background, edge of the radial gradient; also the robe's base. */
  outer: string;
  /** Hair and the inner robe. */
  figure: string;
  /** Aura, trim, formation, swords, rays, dragon and rim. */
  aura: string;
}

/** One palette per realm, in ladder order. */
const PALETTES: readonly Palette[] = [
  { inner: "#8b93a1", outer: "#565e6a", figure: "#eef1f5", aura: "#cfd6df" }, // Ngưng Khí
  { inner: "#7fa08a", outer: "#44654f", figure: "#f0f5f0", aura: "#c9e8cf" }, // Trúc Cơ
  { inner: "#c9a35a", outer: "#7a5a20", figure: "#fff8e6", aura: "#ffd76a" }, // Kết Đan
  { inner: "#5fa8c9", outer: "#27627f", figure: "#f0faff", aura: "#a8e6ff" }, // Nguyên Anh
  { inner: "#6f86d6", outer: "#2f4192", figure: "#f2f4ff", aura: "#bcd0ff" }, // Hóa Thần
  { inner: "#8c6fd6", outer: "#432e92", figure: "#f6f2ff", aura: "#d6c4ff" }, // Anh Biến
  { inner: "#c96f9f", outer: "#832657", figure: "#fff0f7", aura: "#ffc0de" }, // Vấn Đỉnh
  { inner: "#3d4466", outer: "#121528", figure: "#cfd6ff", aura: "#8ea0ff" }, // Âm Hư
  { inner: "#f0b24a", outer: "#bb4f14", figure: "#fffbe8", aura: "#fff0a0" }, // Dương Thực
  { inner: "#3fb7a6", outer: "#0c5560", figure: "#eafffb", aura: "#8ff5e0" }, // Khuy Niết
  { inner: "#4f8dff", outer: "#182a92", figure: "#eef4ff", aura: "#a9c8ff" }, // Tịnh Niết
  { inner: "#a04dff", outer: "#360f80", figure: "#f6ecff", aura: "#dba8ff" }, // Toái Niết
  { inner: "#6b6b78", outer: "#1a1a22", figure: "#e6e0d0", aura: "#c9b88a" }, // Thiên Nhân Ngũ Suy
  { inner: "#e0524d", outer: "#640d1a", figure: "#fff0ec", aura: "#ffb199" }, // Không Niết
  { inner: "#1fc8e0", outer: "#092862", figure: "#effdff", aura: "#9af0ff" }, // Không Linh
  { inner: "#7a2bd6", outer: "#10052a", figure: "#f3e8ff", aura: "#e09bff" }, // Không Huyền
  { inner: "#f5c542", outer: "#851808", figure: "#fff8dc", aura: "#ffe680" }, // Không Kiếp
  { inner: "#f7d774", outer: "#946500", figure: "#fffdf2", aura: "#ffffff" }, // Đạp Thiên Kiều
  { inner: "#3a2c00", outer: "#000000", figure: "#ffd95a", aura: "#ffe89a" }, // Đạp Thiên Cảnh
];

const SKIN = "#f3dccb";
const SKIN_SHADE = "#d9b8a4";
const INK = "#2a2230";
/** The robe fades to this at the hem. */
const ROBE_DEEP = "#07070d";

/** Realm position (0-based) for each ladder level, derived from the ladder. */
const REALM_INDEX_BY_LEVEL: readonly number[] = (() => {
  const out: number[] = [];
  let realm = -1;
  let previous: string | null = null;
  for (const level of CULTIVATION_LADDER) {
    if (level.realm !== previous) {
      realm += 1;
      previous = level.realm;
    }
    out.push(realm);
  }
  return out;
})();

/** The realm's 0-based position for a ladder level, clamped to the palettes. */
export function realmIndexForLevel(levelIndex: number): number {
  const index = REALM_INDEX_BY_LEVEL[levelIndex] ?? 0;
  return Math.max(0, Math.min(index, PALETTES.length - 1));
}

/** Sword angles (degrees from straight up), fanned behind the shoulders. */
function swordAngles(realm: number): number[] {
  const pairs =
    realm >= 16 ? 4 : realm >= 13 ? 3 : realm >= 9 ? 2 : realm >= 7 ? 1 : 0;
  const angles = [34, 58, 80, 16].slice(0, pairs);
  return angles.flatMap((angle) => [-angle, angle]);
}

/** Head scale: grows the face from the neck, keeping the crown inside the circle. */
const HEAD_SCALE = 1.18;
const HEAD_TRANSFORM = `translate(48 43) scale(${HEAD_SCALE}) translate(-48 -40)`;

/** Centre of the head (after scaling): the vortex, formation and rays turn around it. */
const HX = 48;
const HY = 34.5;

/** An open arc around the head, from angle `from` sweeping `sweep` degrees. */
function arc(r: number, from: number, sweep: number): string {
  const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const x0 = HX + r * Math.cos(rad(from));
  const y0 = HY + r * Math.sin(rad(from));
  const x1 = HX + r * Math.cos(rad(from + sweep));
  const y1 = HY + r * Math.sin(rad(from + sweep));
  const f = (n: number) => n.toFixed(2);
  return `M${f(x0)} ${f(y0)} A${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${f(x1)} ${f(y1)}`;
}

/** The vortex: arcs that widen and fade outwards. */
const VORTEX = [
  { r: 14, from: 0, sweep: 240, width: 2.4, opacity: 0.95 },
  { r: 20, from: 120, sweep: 225, width: 2, opacity: 0.8 },
  { r: 27, from: 235, sweep: 215, width: 1.7, opacity: 0.62 },
  { r: 35, from: 340, sweep: 205, width: 1.4, opacity: 0.46 },
  { r: 44, from: 80, sweep: 195, width: 1.2, opacity: 0.32 },
].map((a) => ({ ...a, d: arc(a.r, a.from, a.sweep) }));

const RAY_ANGLES = Array.from({ length: 16 }, (_, i) => i * 22.5);
const TICK_ANGLES = Array.from({ length: 36 }, (_, i) => i * 10);
const RUNE_ANGLES = Array.from({ length: 8 }, (_, i) => i * 45 + 22.5);

/** Spirit motes, in the order they appear as the realm rises. */
const MOTES: readonly [number, number, number][] = [
  [14, 30, 1],
  [82, 26, 0.8],
  [20, 58, 0.7],
  [76, 52, 1],
  [10, 44, 0.6],
  [88, 40, 0.7],
  [26, 14, 0.8],
  [70, 12, 0.6],
  [6, 66, 0.9],
  [90, 64, 0.6],
  [34, 8, 0.5],
  [62, 6, 0.7],
  [16, 80, 0.6],
  [84, 80, 0.8],
  [4, 24, 0.5],
  [92, 18, 0.6],
];

/**
 * The storm grows with the realm, in six steps (`stormLevelFor`):
 *   0 Khuy Niết       two bolts in the sky
 *   1 Tịnh Niết       they fork, two more bolts down the sides
 *   2 Không Niết      crimson lightning, the sky flashes, the held sword crackles
 *   3 Không Linh      a ring of lightning around the head, bolts from above
 *   4 Không Kiếp      a bolt strikes the sword, bolts at the feet, a faster storm
 *   5 Đạp Thiên Cảnh  golden lightning, a second ring, the heaviest storm
 */
function stormLevelFor(realm: number): number {
  if (realm >= 18) return 5;
  if (realm >= 16) return 4;
  if (realm >= 14) return 3;
  if (realm >= 13) return 2;
  if (realm >= 10) return 1;
  if (realm >= 9) return 0;
  return -1;
}

/** Bolts behind the cultivator, each from a storm level. */
const SKY_BOLTS: readonly { level: number; d: string }[] = [
  { level: 0, d: "M8 4 L15 13 L11 15 L19 26 L15 27 L22 37" },
  { level: 0, d: "M90 6 L83 14 L87 16 L79 25 L83 27 L76 36" },
  { level: 1, d: "M15 13 L8 18 L10 20 L3 27" },
  { level: 1, d: "M83 14 L90 20 L88 22 L95 28" },
  { level: 1, d: "M1 44 L10 49 L7 52 L16 57 L12 59 L21 66" },
  { level: 1, d: "M95 46 L86 51 L89 54 L80 59 L84 61 L75 68" },
  { level: 3, d: "M30 -2 L34 6 L29 9 L36 17" },
  { level: 3, d: "M66 -2 L62 6 L67 9 L60 17" },
  { level: 3, d: "M48 -4 L45 2 L50 4 L46 9" },
  { level: 4, d: "M19 26 L12 32 L16 34 L8 41" },
  { level: 4, d: "M79 25 L86 31 L82 33 L90 40" },
];

/** Bolts in front: one strikes the sword's hilt, two at the feet. */
const FRONT_BOLTS: readonly { level: number; d: string }[] = [
  { level: 4, d: "M97 0 L89 9 L93 12 L85 18 L88 21 L81 27" },
  { level: 4, d: "M1 70 L11 75 L7 79 L17 83 L13 87 L23 96" },
  { level: 4, d: "M95 72 L85 77 L89 81 L79 85 L83 89 L73 97" },
];

/** The bolt that runs down the held sword. */
const SWORD_BOLT = "M81 30 L77 38 L82 42 L76 52 L81 56 L75 68 L80 72 L76 84";

/** A jagged ring of lightning around the head, radius about `r`. */
function lightningRing(r: number, seed: number): string {
  const points = Array.from({ length: 40 }, (_, i) => {
    const jitter =
      (i % 2 === 0 ? 2.2 : -1.8) + (((i * 7 + seed) % 5) - 2) * 0.5;
    const angle = (i * 9 * Math.PI) / 180;
    const x = HX + (r + jitter) * Math.cos(angle);
    const y = HY + (r + jitter) * Math.sin(angle);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return `M${points.join(" L")} Z`;
}
const RING_INNER = lightningRing(27, 0);
const RING_OUTER = lightningRing(38, 3);

/** One bolt: a coloured glow with a white-hot core, flickering. */
function Bolt({
  d,
  color,
  width,
  delay,
  duration,
  rest,
  double,
}: {
  d: string;
  color: string;
  width: number;
  delay: number;
  duration: number;
  /** Opacity between strikes. */
  rest: number;
  /** Two strikes per cycle instead of one. */
  double: boolean;
}) {
  return (
    <g
      className={double ? "ra-flicker ra-flicker-double" : "ra-flicker"}
      style={
        {
          animationDelay: `${delay}s`,
          animationDuration: `${duration}s`,
          "--ra-bolt-rest": rest,
        } as CSSProperties
      }
    >
      <path d={d} stroke={color} strokeWidth={width} opacity="0.75" />
      <path d={d} stroke="#fff" strokeWidth={Math.max(0.7, width * 0.36)} />
    </g>
  );
}

/** The dragon's body: in from the lower right, over the head, down the left. */
const DRAGON_BODY =
  "M96 84 C82 70 88 36 76 22 C64 9 38 9 26 19 C18 26 16 36 19 44";

export function RealmAvatar({
  levelIndex,
  size = 40,
  className,
}: {
  /** `RealmSummary.levelIndex` (0 … 89). */
  levelIndex: number;
  /** Rendered width and height in px. */
  size?: number;
  className?: string;
}) {
  const realm = realmIndexForLevel(levelIndex);
  const p = PALETTES[realm]!;
  const final = realm === PALETTES.length - 1;
  // Unique per instance: several avatars can share a page.
  const id = useId();
  const ids = {
    bg: `${id}-bg`,
    clip: `${id}-clip`,
    robe: `${id}-robe`,
    cape: `${id}-cape`,
    hair: `${id}-hair`,
    eye: `${id}-eye`,
    dragon: `${id}-dragon`,
    glow: `${id}-glow`,
    storm: `${id}-storm`,
    soft: `${id}-soft`,
  };
  const url = (key: keyof typeof ids) => `url(#${ids[key]})`;
  const spin = "motion-safe:animate-[spin_60s_linear_infinite]";
  const origin = { transformOrigin: `${HX}px ${HY}px` };
  /** Outer glow strength in px per step; none below Trúc Cơ. */
  const halo =
    realm === 0 ? 0 : final ? 3 : realm >= 13 ? 2.2 : realm >= 4 ? 1.4 : 0.8;
  const haloStyle =
    halo > 0
      ? ({
          "--ra-glow": p.aura,
          "--ra-halo": halo,
          overflow: "visible",
        } as CSSProperties)
      : undefined;
  const storm = stormLevelFor(realm);
  /** Lightning colour: the realm's aura, crimson from Không Niết, gold at the summit. */
  const boltColor = final ? "#ffcf3a" : storm >= 2 ? "#ff2d55" : p.aura;
  const boltWidth = 2 + Math.max(storm, 0) * 0.45;
  /** Seconds per flicker cycle: the storm strikes more often as it grows. */
  const boltCycle = 2.6 - Math.max(storm, 0) * 0.3;
  const bolt = (d: string, i: number, scale = 1) => (
    <Bolt
      key={d}
      d={d}
      color={boltColor}
      width={boltWidth * scale}
      delay={-((i * 0.71) % boltCycle)}
      duration={boltCycle}
      rest={0.2 + Math.max(storm, 0) * 0.1}
      double={storm >= 3}
    />
  );
  const join = (...names: (string | false | undefined)[]) =>
    names.filter(Boolean).join(" ");

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      aria-hidden="true"
      className={join(className, halo > 0 && "ra-halo")}
      style={haloStyle}
    >
      <defs>
        <radialGradient id={ids.bg} cx="50%" cy="38%" r="64%">
          <stop offset="0%" stopColor={p.inner} />
          <stop offset="100%" stopColor={p.outer} />
        </radialGradient>
        <radialGradient id={ids.eye} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000" stopOpacity="0.85" />
          <stop offset="70%" stopColor="#000" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={ids.robe} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.outer} />
          <stop offset="100%" stopColor={ROBE_DEEP} />
        </linearGradient>
        <linearGradient id={ids.cape} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.inner} />
          <stop offset="100%" stopColor={ROBE_DEEP} />
        </linearGradient>
        <linearGradient id={ids.hair} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.figure} />
          <stop offset="55%" stopColor={p.aura} />
          <stop offset="100%" stopColor={p.outer} />
        </linearGradient>
        <linearGradient id={ids.dragon} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff3b0" />
          <stop offset="50%" stopColor={final ? "#ffcf3a" : p.aura} />
          <stop offset="100%" stopColor="#c27c0e" />
        </linearGradient>
        {/* Glow: the shape plus a blurred copy under it. */}
        <filter id={ids.glow} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* A wider glow for lightning, wider still as the storm grows. */}
        <filter id={ids.storm} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur
            in="SourceGraphic"
            stdDeviation={1.4 + Math.max(storm, 0) * 0.35}
            result="blur"
          />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={ids.soft} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <clipPath id={ids.clip}>
          <circle cx="48" cy="48" r="48" />
        </clipPath>
      </defs>

      <g clipPath={url("clip")}>
        <circle cx="48" cy="48" r="48" fill={url("bg")} />

        {/* Rays (Bộ 3 and up), turning slowly behind everything. */}
        {realm >= 13 ? (
          <g
            fill={p.aura}
            opacity={final ? 0.5 : realm >= 16 ? 0.36 : 0.24}
            className={spin}
            style={origin}
          >
            {RAY_ANGLES.map((angle) => (
              <path
                key={angle}
                d={`M${HX} ${HY} L${HX - 2.6} -20 L${HX + 2.6} -20 Z`}
                transform={`rotate(${angle} ${HX} ${HY})`}
              />
            ))}
          </g>
        ) : null}

        {/* The storm behind the cultivator (Khuy Niết and up), see stormLevelFor. */}
        {storm >= 0 ? (
          <g
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
            filter={url("storm")}
          >
            {SKY_BOLTS.filter((b) => b.level <= storm).map((b, i) =>
              bolt(b.d, i),
            )}
            {storm >= 3 ? (
              <g className={spin} style={origin}>
                {bolt(RING_INNER, 3, 0.55)}
              </g>
            ) : null}
            {storm >= 5 ? (
              <g
                className="motion-safe:animate-[spin_40s_linear_infinite] [animation-direction:reverse]"
                style={origin}
              >
                {bolt(RING_OUTER, 7, 0.5)}
              </g>
            ) : null}
          </g>
        ) : null}

        {/* The vortex (Âm Hư and up): a dark eye behind the head, arcs around it. */}
        {realm >= 7 ? (
          <>
            <circle cx={HX} cy={HY} r="16" fill={url("eye")} />
            <g
              fill="none"
              stroke={p.aura}
              strokeLinecap="round"
              filter={url("glow")}
              className="motion-safe:animate-[spin_40s_linear_infinite] [animation-direction:reverse]"
              style={origin}
            >
              {VORTEX.map((a) => (
                <path
                  key={a.r}
                  d={a.d}
                  strokeWidth={a.width}
                  opacity={a.opacity}
                />
              ))}
            </g>
          </>
        ) : null}

        {/* The formation circle behind the head (Hóa Thần and up). */}
        {realm >= 4 ? (
          <g
            fill="none"
            stroke={p.aura}
            filter={url("glow")}
            className={realm >= 10 ? spin : undefined}
            style={origin}
          >
            <circle cx={HX} cy={HY} r="19.5" strokeWidth="1.2" opacity="0.9" />
            <circle cx={HX} cy={HY} r="16" strokeWidth="0.6" opacity="0.7" />
            {TICK_ANGLES.map((angle) => (
              <path
                key={angle}
                d={`M${HX} ${HY - 16.6} V${HY - (angle % 30 === 0 ? 19.2 : 18)}`}
                strokeWidth="0.6"
                opacity="0.8"
                transform={`rotate(${angle} ${HX} ${HY})`}
              />
            ))}
            {realm >= 10 ? (
              <>
                <circle
                  cx={HX}
                  cy={HY}
                  r="25"
                  strokeWidth="0.8"
                  strokeDasharray="5 2 1 2"
                  opacity="0.8"
                />
                {RUNE_ANGLES.map((angle) => (
                  <path
                    key={angle}
                    d={`M${HX} ${HY - 24.8} l1.5 -2 l-1.5 -2 l-1.5 2 Z`}
                    fill={p.aura}
                    strokeWidth="0.4"
                    transform={`rotate(${angle} ${HX} ${HY})`}
                  />
                ))}
              </>
            ) : null}
          </g>
        ) : null}

        {/* Aura behind the body, stronger with each realm. */}
        {realm >= 1 ? (
          <ellipse
            cx="48"
            cy="64"
            rx="34"
            ry="30"
            fill={p.aura}
            opacity={Math.min(0.25 + realm * 0.03, 0.75)}
            filter={url("soft")}
            className="ra-pulse"
          />
        ) : null}

        {/* The dragon (Không Kiếp and up), coiled behind the cultivator. */}
        {realm >= 16 ? (
          <g
            filter={url("glow")}
            strokeLinecap="round"
            fill="none"
            className="ra-sway"
            style={{ transformOrigin: "48px 60px", animationDuration: "6s" }}
          >
            <path
              d={DRAGON_BODY}
              stroke="#2a1400"
              strokeWidth="9.5"
              opacity="0.85"
            />
            <path d={DRAGON_BODY} stroke={url("dragon")} strokeWidth="7" />
            <path
              d={DRAGON_BODY}
              stroke="#7a4a00"
              strokeWidth="7"
              strokeDasharray="1.2 2.4"
              opacity="0.45"
            />
            <path
              d={DRAGON_BODY}
              stroke="#fff6cc"
              strokeWidth="1.4"
              opacity="0.8"
            />
            <g transform="translate(20 47) rotate(66) scale(1.15)">
              {/* Mane, horns, head, then the eye and a whisker. */}
              <path
                d="M-5 -2 L-13 -7 L-10 -1.5 L-15 1 L-9.5 2.5 L-12 7 L-4 4 Z"
                fill="#c27c0e"
              />
              <path
                d="M-4 -5 C-8 -10 -12 -12 -17 -12 C-12 -9 -9 -6.5 -6 -3 Z"
                fill="#fff3b0"
              />
              <path
                d="M-1 -5.5 C-4 -11 -7 -14 -11 -15.5 C-8 -11.5 -5.5 -8 -3.5 -4 Z"
                fill="#fff3b0"
              />
              <path
                d="M-7 0 C-7 -4 -3 -7 2 -6.5 C6 -6 10 -5 14 -3.5 C15.5 -2.5 15.5 -0.5 14 0.5 L8 1.5 L12 4 C9.5 6 4 6 0 5 C-4 4.5 -7 3 -7 0 Z"
                fill={url("dragon")}
                stroke="#3a1d00"
                strokeWidth="0.6"
                strokeLinejoin="round"
              />
              <circle cx="3" cy="-2.6" r="1.3" fill="#d4243a" />
              <path
                d="M13 -2.5 C18 -5 22 0 27 -2.5"
                stroke="#fff3b0"
                strokeWidth="0.7"
              />
            </g>
          </g>
        ) : null}

        {/* Flying swords, fanned behind the shoulders. */}
        {swordAngles(realm).map((angle, i) => (
          <g
            key={angle}
            className="ra-bob"
            style={{ animationDelay: `${(i * 0.37) % 3}s` }}
          >
            <g
              transform={`translate(48 66) rotate(${angle})`}
              filter={url("glow")}
            >
              <path d="M0 -8 L2.6 -34 L0 -44 L-2.6 -34 Z" fill={p.aura} />
              <path
                d="M0 -10 V-40"
                stroke="#fff"
                strokeWidth="0.5"
                opacity="0.8"
              />
              <path
                d="M-4 -8 H4"
                stroke={p.aura}
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </g>
          </g>
        ))}

        {/* The cape (Nguyên Anh and up), billowing out to the left. */}
        {realm >= 3 ? (
          <g
            fill={url("cape")}
            stroke={p.aura}
            strokeWidth="1.1"
            strokeLinejoin="round"
          >
            <path
              d="M38 52 C26 54 12 62 0 76 C7 80 5 90 2 98 L34 98 Z"
              className="ra-sway"
              style={{ transformOrigin: "38px 52px" }}
            />
            <path
              d="M58 52 C70 54 84 62 96 76 C89 80 91 90 94 98 L62 98 Z"
              className="ra-sway"
              style={{ transformOrigin: "58px 52px", animationDelay: "-2s" }}
            />
          </g>
        ) : null}

        {/* Long hair down the back, a lock blowing to the right. */}
        <path
          d="M39 26 C35 40 32 56 28 74 C35 71 40 73 44 69 L52 69 C56 73 61 71 68 74 C64 56 61 40 57 26 Z"
          fill={url("hair")}
          className="ra-sway"
          style={{ transformOrigin: "48px 28px", animationDuration: "5s" }}
        />
        <g className="ra-flutter" style={{ transformOrigin: "58px 39px" }}>
          <path
            d="M57 33 C68 40 80 42 92 36 C84 46 70 49 59 45 Z"
            fill={url("hair")}
            opacity="0.9"
          />
          <path
            d="M62 40 C72 44 80 44 88 40"
            fill="none"
            stroke={p.outer}
            strokeWidth="0.6"
            opacity="0.45"
          />
        </g>
        <g
          fill="none"
          stroke={p.outer}
          strokeWidth="0.6"
          opacity="0.45"
          strokeLinecap="round"
        >
          <path d="M38 34 C36 46 34 58 31 70" />
          <path d="M58 34 C60 46 62 58 65 70" />
        </g>

        {/* Robe: torso, then the white inner robe and the crossed collar. */}
        <path
          d="M20 98 C20 72 28 56 40 51 L48 48 L56 51 C68 56 76 72 76 98 Z"
          fill={url("robe")}
        />
        <path d="M42 49 L48 63 L54 49 Z" fill={p.figure} opacity="0.9" />
        <g fill="none" stroke={p.aura} strokeLinecap="round" strokeWidth="1.6">
          <path d="M41 49.5 L53 81" />
          <path d="M55 49.5 L49.5 62" />
        </g>

        {/* Pauldrons (Hóa Thần and up). */}
        {realm >= 4 ? (
          <g
            fill={p.aura}
            stroke={ROBE_DEEP}
            strokeWidth="0.6"
            strokeLinejoin="round"
          >
            <path d="M22 66 C21 56 29 50 40 51 C35 55 31 60 30 68 C27 66 24 66 22 66 Z" />
            <path d="M74 66 C75 56 67 50 56 51 C61 55 65 60 66 68 C69 66 72 66 74 66 Z" />
            <path
              d="M25 62 C28 57 32 54 37 53"
              fill="none"
              stroke={ROBE_DEEP}
              opacity="0.5"
            />
            <path
              d="M71 62 C68 57 64 54 59 53"
              fill="none"
              stroke={ROBE_DEEP}
              opacity="0.5"
            />
          </g>
        ) : null}

        {/* Belt and, from Kết Đan, the core; ringed from Nguyên Anh. */}
        <rect
          x="33"
          y="80.5"
          width="30"
          height="4"
          rx="1"
          fill={p.aura}
          opacity="0.7"
        />
        {realm >= 2 ? (
          <circle
            cx="48"
            cy="82.5"
            r="3.4"
            fill={p.inner}
            stroke="#fff"
            strokeWidth="0.6"
            filter={url("glow")}
            className="ra-pulse"
          />
        ) : null}
        {realm >= 3 ? (
          <circle
            cx="48"
            cy="82.5"
            r="6"
            fill="none"
            stroke={p.aura}
            strokeWidth="1"
            filter={url("glow")}
          />
        ) : null}

        {/* The held sword (Bộ 3 and up), lightning running down it. */}
        {realm >= 13 ? (
          <g filter={url("glow")}>
            <path
              d="M78.5 34 L81.5 34 L81.5 88 L80 94 L78.5 88 Z"
              fill="#e8ecf4"
              stroke={ROBE_DEEP}
              strokeWidth="0.4"
            />
            <path
              d="M75 34 H85"
              stroke={p.aura}
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M80 26 V33"
              stroke={p.aura}
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </g>
        ) : null}

        {/* Lightning in front: down the held sword, then (Không Kiếp up) the strikes. */}
        {storm >= 2 ? (
          <g
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
            filter={url("storm")}
          >
            {bolt(SWORD_BOLT, 1, 0.85)}
            {FRONT_BOLTS.filter((b) => b.level <= storm).map((b, i) =>
              bolt(b.d, i + 2),
            )}
          </g>
        ) : null}

        {/* Neck, then the head, drawn larger than life so the face reads at badge size. */}
        <path d="M44.5 39 V47 L48 50 L51.5 47 V39 Z" fill={SKIN_SHADE} />
        <g transform={HEAD_TRANSFORM}>
          <path
            d="M41 29 C41 22 55 22 55 29 C55 36 52.5 41 48 42.5 C43.5 41 41 36 41 29 Z"
            fill={SKIN}
          />

          {/* Hair: bangs, the locks framing the face, and a topknot or (Không Kiếp up) a crown. */}
          <path
            d="M39.5 31 C37.5 19 45 15.5 48 15.5 C51 15.5 58.5 19 56.5 31 C54.5 25 51 23.5 48 25.5 C45 23.5 41.5 25 39.5 31 Z"
            fill={p.figure}
          />
          <path
            d="M40.5 27 C38 38 38 48 35 62 C39 55 41 45 42.5 33 Z"
            fill={p.figure}
          />
          <path
            d="M55.5 27 C58 38 58 48 61 62 C57 55 55 45 53.5 33 Z"
            fill={p.figure}
          />
          {realm >= 16 ? (
            <g
              fill={p.aura}
              stroke={ROBE_DEEP}
              strokeWidth="0.5"
              strokeLinejoin="round"
              filter={url("glow")}
            >
              <path d="M43 18 C40.5 15 39.5 12.5 39.5 9.5 C42.5 11.5 44.5 14 45.5 17 Z" />
              <path d="M53 18 C55.5 15 56.5 12.5 56.5 9.5 C53.5 11.5 51.5 14 50.5 17 Z" />
              <path d="M43.5 18.5 C43.5 12.5 46 9 48 5 C50 9 52.5 12.5 52.5 18.5 Z" />
              <path
                d="M36 14 L60 11.6"
                strokeWidth="1.4"
                stroke={p.aura}
                strokeLinecap="round"
              />
              <circle cx="48" cy="13.5" r="1.4" fill="#d4243a" stroke="none" />
            </g>
          ) : (
            <>
              <ellipse cx="48" cy="14.5" rx="4.2" ry="3.2" fill={p.figure} />
              <path
                d="M40.5 14.5 H55.5"
                stroke={p.aura}
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </>
          )}

          {/* Brows, eyes (glowing from Bộ 3) and mouth. */}
          <g fill="none" strokeLinecap="round">
            <path
              d="M42.6 28.4 L46.6 29.4 M49.4 29.4 L53.4 28.4"
              stroke={INK}
              strokeWidth="0.9"
            />
            <path
              d="M43.2 31.6 Q44.9 30.6 46.5 31.6 M49.5 31.6 Q51.1 30.6 52.8 31.6"
              stroke={realm >= 13 ? p.aura : INK}
              strokeWidth={realm >= 13 ? 1.2 : 0.9}
              filter={realm >= 13 ? url("glow") : undefined}
            />
            <path d="M46.9 38 H49.1" stroke="#b07d6e" strokeWidth="0.7" />
          </g>

          {/* Third eye (Bộ 3 and up). */}
          {realm >= 13 ? (
            <path
              d="M48 24.6 L49 26.3 L48 28 L47 26.3 Z"
              fill={final ? "#ffcf3a" : "#e0303a"}
              filter={url("glow")}
            />
          ) : null}
        </g>

        {/* Spirit motes (Kết Đan and up), more with each realm. */}
        {realm >= 2 ? (
          <g fill="#fff" filter={url("glow")}>
            {MOTES.slice(0, Math.min(MOTES.length, realm - 1)).map(
              ([x, y, r], i) => (
                <circle
                  key={`${x}-${y}`}
                  cx={x}
                  cy={y}
                  r={r}
                  className="ra-float"
                  style={{ animationDelay: `${-((i * 0.83) % 4.5)}s` }}
                />
              ),
            )}
          </g>
        ) : null}
        {/* The sky flashes with the strikes (Không Niết and up). */}
        {storm >= 2 ? (
          <circle
            cx="48"
            cy="48"
            r="48"
            fill={final ? "#fff4c2" : "#fff"}
            opacity="0"
            className="ra-strike"
            style={
              {
                "--ra-strike": 0.12 + storm * 0.05,
                animationDuration: `${boltCycle * 2}s`,
              } as CSSProperties
            }
          />
        ) : null}
      </g>

      {/* Rim: thin from Hóa Thần, heavier in Bộ 3, heaviest at the summit. */}
      {realm >= 4 ? (
        <circle
          cx="48"
          cy="48"
          r={final ? 45.2 : realm >= 13 ? 45.6 : 46.4}
          fill="none"
          stroke={p.aura}
          strokeWidth={final ? 5.6 : realm >= 13 ? 4.4 : 2.8}
          opacity={realm >= 13 ? 1 : 0.8}
        />
      ) : null}
    </svg>
  );
}
