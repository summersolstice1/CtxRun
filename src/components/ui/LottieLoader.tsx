import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import liquidLoaderUrl from '@/assets/liquid-loader.lottie';

interface LottieLoaderProps {
  src?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function LottieLoader({ src = liquidLoaderUrl, className, style }: LottieLoaderProps) {
  return (
    <DotLottieReact
      src={src}
      autoplay
      loop
      className={className}
      style={style}
    />
  );
}
