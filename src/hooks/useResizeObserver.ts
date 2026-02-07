import { useState, useEffect, useRef } from 'react';

export function useResizeObserver<T extends HTMLElement>() {
    const [size, setSize] = useState({ width: 0, height: 0 });
    const ref = useRef<T>(null);
    const frameRef = useRef<number | null>(null);
    const pendingSizeRef = useRef(size);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const observer = new ResizeObserver((entries) => {
            if (!entries[0]) return;

            const { width, height } = entries[0].contentRect;
            pendingSizeRef.current = { width, height };

            if (frameRef.current !== null) {
                return;
            }

            frameRef.current = window.requestAnimationFrame(() => {
                frameRef.current = null;

                setSize((previous) => {
                    const next = pendingSizeRef.current;

                    if (
                        Math.abs(previous.width - next.width) < 0.5 &&
                        Math.abs(previous.height - next.height) < 0.5
                    ) {
                        return previous;
                    }

                    return next;
                });
            });
        });

        observer.observe(element);
        return () => {
            observer.disconnect();
            if (frameRef.current !== null) {
                window.cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
        };
    }, []);

    return { ref, ...size };
}
