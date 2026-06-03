interface MaximusLogoProps {
  height?: number;
  variant?: 'light' | 'dark';
}

export default function MaximusLogo({ height = 64, variant = 'light' }: MaximusLogoProps) {
  const iconBg = variant === 'light' ? 'white' : '#0369a1';
  const iconColor = variant === 'light' ? '#0369a1' : 'white';
  const textColor = variant === 'light' ? 'white' : '#0c1a2e';
  const subColor = variant === 'light' ? 'rgba(255,255,255,0.75)' : '#64748b';

  const iconSize = height;
  const gap = height * 0.18;
  const totalWidth = iconSize + gap + iconSize * 2.6;

  return (
    <svg
      width={totalWidth}
      height={height}
      viewBox={`0 0 ${totalWidth} ${height}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {/* Icon box */}
      <rect
        x="0"
        y="0"
        width={iconSize}
        height={iconSize}
        rx={iconSize * 0.14}
        fill={iconBg}
      />

      {/* M letter — two outer uprights + centre V */}
      {(() => {
        const p = iconSize * 0.18;   // padding from edge
        const w = iconSize - p * 2;  // usable width
        const t = iconSize * 0.11;   // stroke thickness
        const top = p;
        const bot = iconSize - p;
        const mid = iconSize * 0.56; // depth of V dip

        const lx = p;               // left upright x
        const rx = p + w;           // right upright x
        const mx = p + w / 2;       // centre x

        return (
          <path
            d={`
              M ${lx} ${bot}
              L ${lx} ${top}
              L ${mx} ${mid}
              L ${rx} ${top}
              L ${rx} ${bot}
              L ${rx - t} ${bot}
              L ${rx - t} ${top + t * 1.4}
              L ${mx} ${mid + t * 1.1}
              L ${lx + t} ${top + t * 1.4}
              L ${lx + t} ${bot}
              Z
            `}
            fill={iconColor}
          />
        );
      })()}

      {/* MAXIMUS text */}
      <text
        x={iconSize + gap}
        y={height * 0.52}
        fontFamily="'Georgia', 'Times New Roman', serif"
        fontWeight="700"
        fontSize={height * 0.38}
        letterSpacing={height * 0.03}
        fill={textColor}
        dominantBaseline="middle"
      >
        MAXIMUS
      </text>

      {/* ACADEMY subtext */}
      <text
        x={iconSize + gap + height * 0.02}
        y={height * 0.79}
        fontFamily="'Arial', sans-serif"
        fontWeight="400"
        fontSize={height * 0.175}
        letterSpacing={height * 0.065}
        fill={subColor}
        dominantBaseline="middle"
      >
        ACADEMY
      </text>
    </svg>
  );
}
