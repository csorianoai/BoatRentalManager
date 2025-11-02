import { useEffect, useState } from 'react';
import { useSpring } from 'framer-motion';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}

export function AnimatedCounter({ 
  value, 
  duration = 2, 
  decimals = 0, 
  prefix = '', 
  suffix = '' 
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(0);
  
  const spring = useSpring(0, { 
    duration: duration * 1000,
    bounce: 0
  });

  useEffect(() => {
    spring.set(value);
    
    const unsubscribe = spring.on('change', (latest) => {
      setDisplayValue(latest);
    });

    return () => unsubscribe();
  }, [value, spring]);

  const formattedValue = displayValue.toFixed(decimals);

  return (
    <span>
      {prefix}{formattedValue}{suffix}
    </span>
  );
}
