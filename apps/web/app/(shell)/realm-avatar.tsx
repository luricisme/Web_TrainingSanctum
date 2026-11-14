import { useId } from "react";
import { CULTIVATION_LADDER } from "@training-sanctum/domain";

/**
 * The realm avatar: a seated cultivator drawn in SVG, one look per realm of
 * the ladder (19 realms, Ngưng Khí to Đạp Thiên Cảnh). The colours change
 * with every realm and the figure gains a layer at fixed steps, so a higher
 * realm always reads as stronger:
 *
 *   1 Trúc Cơ      aura behind the body
 *   2 Kết Đan      the core (golden pill) in the belly
 *   3 Nguyên Anh   a ring around the core
 *   4 Hóa Thần     halo behind the head, rim on the avatar
 *   7 Âm Hư        two flying swords
 *   9 Khuy Niết    four swords (Bộ 2)
 *  10 Tịnh Niết    second halo ring
 *  13 Không Niết   slow-turning rays, third eye, six swords (Bộ 3)
 *  16 Không Kiếp   crown, eight swords
 *  18 Đạp Thiên Cảnh  gold figure on black, full radiance (Bộ 4)
 *
 * Decorative only: it never carries information the label does not.
 */

interface Palette {
  /** Background, centre of the radial gradient. */
  inner: string;
  /** Background, edge of the radial gradient. */
  outer: string;
  /** The cultivator. */
  figure: string;
  /** Aura, halo, swords, rays and rim. */
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
  const pairs = realm >= 16 ? 4 : realm >= 13 ? 3 : realm >= 9 ? 2 : realm >= 7 ? 1 : 0;
  const angles = [38, 62, 84, 20].slice(0, pairs);
  return angles.flatMap((angle) => [-angle, angle]);
}

const RAY_ANGLES = Array.from({ length: 12 }, (_, i) => i * 30);

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
  const palette = PALETTES[realm]!;
  const final = realm === PALETTES.length - 1;
  // Unique per instance: several avatars can share a page.
  const id = useId();
  const bg = `${id}-bg`;
  const clip = `${id}-clip`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <radialGradient id={bg} cx="50%" cy="42%" r="62%">
          <stop offset="0%" stopColor={palette.inner} />
          <stop offset="100%" stopColor={palette.outer} />
        </radialGradient>
        <clipPath id={clip}>
          <circle cx="24" cy="24" r="24" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clip})`}>
        <circle cx="24" cy="24" r="24" fill={`url(#${bg})`} />

        {/* Rays (Bộ 3 and up), turning slowly behind everything. */}
        {realm >= 13 ? (
          <g
            fill={palette.aura}
            opacity={final ? 0.5 : realm >= 16 ? 0.38 : 0.26}
            className="animate-[spin_40s_linear_infinite]"
            style={{ transformOrigin: "24px 24px" }}
          >
            {RAY_ANGLES.map((angle) => (
              <path key={angle} d="M24 24 L22.4 -4 L25.6 -4 Z" transform={`rotate(${angle} 24 24)`} />
            ))}
          </g>
        ) : null}

        {/* Aura behind the body, stronger with each realm. */}
        {realm >= 1 ? (
          <ellipse
            cx="24"
            cy="33"
            rx="17"
            ry="15"
            fill={palette.aura}
            opacity={Math.min(0.12 + realm * 0.022, 0.5)}
          />
        ) : null}

        {/* Flying swords, fanned behind the shoulders. */}
        {swordAngles(realm).map((angle) => (
          <path
            key={angle}
            d="M0 0 L1.5 -15 L0 -20 L-1.5 -15 Z"
            fill={palette.aura}
            opacity="0.92"
            transform={`translate(24 32) rotate(${angle})`}
          />
        ))}

        {/* Halo behind the head; a second ring from Tịnh Niết. */}
        {realm >= 4 ? (
          <circle
            cx="24"
            cy="18"
            r="9.5"
            fill={palette.aura}
            fillOpacity="0.2"
            stroke={palette.aura}
            strokeWidth="1.4"
          />
        ) : null}
        {realm >= 10 ? (
          <circle
            cx="24"
            cy="18"
            r="12.5"
            fill="none"
            stroke={palette.aura}
            strokeWidth="0.9"
            opacity="0.65"
          />
        ) : null}

        {/* The cultivator: robe, head, and a hair bun or (Không Kiếp up) a crown. */}
        <path d="M9 48 C9 34 16 26.5 24 26.5 C32 26.5 39 34 39 48 Z" fill={palette.figure} />
        <circle cx="24" cy="18.5" r="5.6" fill={palette.figure} />
        {realm >= 16 ? (
          <path
            d="M19.4 14 L18.8 8.4 L21.8 11 L24 6.6 L26.2 11 L29.2 8.4 L28.6 14 Z"
            fill={palette.aura}
            stroke={palette.outer}
            strokeWidth="0.5"
            strokeLinejoin="round"
          />
        ) : (
          <circle cx="24" cy="12" r="2.3" fill={palette.figure} />
        )}
        {/* Collar. */}
        <path
          d="M20.4 27.2 L24 32 L27.6 27.2"
          fill="none"
          stroke={palette.outer}
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.7"
        />

        {/* Third eye (Bộ 3 and up). */}
        {realm >= 13 ? (
          <path d="M24 15.6 L25 17.2 L24 18.8 L23 17.2 Z" fill={palette.outer} />
        ) : null}

        {/* The core in the belly, ringed from Nguyên Anh. */}
        {realm >= 2 ? <circle cx="24" cy="38.5" r="2.4" fill={palette.inner} /> : null}
        {realm >= 3 ? (
          <circle
            cx="24"
            cy="38.5"
            r="4.3"
            fill="none"
            stroke={palette.inner}
            strokeWidth="0.9"
            opacity="0.8"
          />
        ) : null}
      </g>

      {/* Rim: thin from Hóa Thần, heavier in Bộ 3, heaviest at the summit. */}
      {realm >= 4 ? (
        <circle
          cx="24"
          cy="24"
          r={final ? 22.6 : realm >= 13 ? 22.8 : 23.2}
          fill="none"
          stroke={palette.aura}
          strokeWidth={final ? 2.8 : realm >= 13 ? 2.2 : 1.4}
          opacity={realm >= 13 ? 1 : 0.8}
        />
      ) : null}
    </svg>
  );
}
