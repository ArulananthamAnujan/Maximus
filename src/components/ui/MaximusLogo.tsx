interface MaximusLogoProps {
  height?: number;
  // light: logo on a coloured (sky-blue) background → invert to white
  // dark:  logo on a white/light background → natural colours
  variant?: 'light' | 'dark';
}

export default function MaximusLogo({ height = 64, variant = 'dark' }: MaximusLogoProps) {
  return (
    <img
      src="/image-removebg-preview.png"
      alt="Maximus Academy"
      height={height}
      style={{
        height,
        width: 'auto',
        display: 'block',
        flexShrink: 0,
        filter: variant === 'light' ? 'brightness(0) invert(1)' : 'none',
      }}
    />
  );
}
