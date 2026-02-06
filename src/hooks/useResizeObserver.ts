import { useState, useEffect, useRef } from 'react';

export function useResizeObserver<T extends HTMLElement>() {
    const [size, setSize] = useState({ width: 0, height: 0 });
    const ref = useRef<T>(null);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const observer = new ResizeObserver((entries) => {
            if (entries[0]) {
                const { width, height } = entries[0].contentRect;
                setSize({ width, height });
            }
        });

        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    return { ref, ...size };
}
