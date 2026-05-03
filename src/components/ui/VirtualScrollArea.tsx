import { useRef, type ReactNode } from 'react';
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';

export type { VirtualItem };

type VirtualScrollAreaProps = {
  count: number;
  estimateSize: number;
  overscan?: number;
  className?: string;
  /** hauteur max du conteneur scrollable (ex: 288, '18rem', '480px') */
  maxHeight: number | string;
  getItemKey?: (index: number) => string | number;
  /** Accessibilité : nom de la liste pour lecteurs d’écran */
  listLabel?: string;
  children: (virtualRow: VirtualItem) => ReactNode;
};

/**
 * Liste virtualisée : ne monte que les lignes visibles (+ overscan).
 * Chaque ligne doit utiliser `ref={virtualizer.measureElement}` via l’enveloppe ci-dessous.
 */
export function VirtualScrollArea({
  count,
  estimateSize,
  overscan = 8,
  className,
  maxHeight,
  getItemKey,
  listLabel = 'Liste',
  children,
}: VirtualScrollAreaProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    ...(getItemKey ? { getItemKey } : {}),
  });

  const maxH = typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight;

  return (
    <div
      ref={parentRef}
      className={className}
      style={{ maxHeight: maxH, overflow: 'auto' }}
      role="list"
      aria-label={listLabel}
      tabIndex={0}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            role="listitem"
            aria-posinset={virtualRow.index + 1}
            aria-setsize={count}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            {children(virtualRow)}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Seuils partagés perf UI */
export const VIRTUAL_PLAYLIST_MIN_ITEMS = 36;
export const VIRTUAL_PLAYERS_MIN_ITEMS = 28;
/** Au-delà : pas d’AnimatePresence sur la liste joueurs */
export const PLAYERS_MOTION_MAX = 18;

/** Sessions actives admin : animations seulement si peu d’éléments */
export const ADMIN_ACTIVE_SESSIONS_MOTION_MAX = 12;
/** Au-delà : virtualiser la liste des sessions actives */
export const VIRTUAL_ACTIVE_SESSIONS_MIN = 24;
