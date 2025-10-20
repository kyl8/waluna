import React, { useState, useEffect, useMemo } from 'react';
import { Box, HStack, Button, Text, VStack } from '@chakra-ui/react';
import logger from '../utils/helpers/logger.js';

let cachedFixedSizeList = null;

// usa react_window FixedSizeList quando disponível, caso contrário, usa implementação interna simples.
function VirtualListInner({ items = [], rowHeight = 112, height = 400, width = '100%', overscan = 3, renderItem, showSort = false, sortKey = 'number' }) {
  const [FixedSizeListComp, setFixedSizeListComp] = useState(null);
  const [sortMode, setSortMode] = useState('ascending'); // 'ascending' | 'descending'
  useEffect(() => {
    if (cachedFixedSizeList !== null) {
      setFixedSizeListComp(cachedFixedSizeList);
      return;
    }
    let mounted = true;
    const load = async () => {
      try {
        const mod = await import('react-window');
        const Comp = mod.FixedSizeList || (mod.default && (mod.default.FixedSizeList || mod.default.List)) || mod.default;
        if (mounted && typeof Comp === 'function') {
          cachedFixedSizeList = Comp;
          setFixedSizeListComp(() => Comp);
        } else {
          cachedFixedSizeList = false; 
        }
      } catch {
        cachedFixedSizeList = false;
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  const sortedItems = useMemo(() => {
    if (!showSort) return items;
    const copy = Array.isArray(items) ? [...items] : [];
    copy.sort((a, b) => {
      const va = Number(a?.[sortKey] ?? a?.absoluteNumber ?? a?.number);
      const vb = Number(b?.[sortKey] ?? b?.absoluteNumber ?? b?.number);
      if (Number.isFinite(va) && Number.isFinite(vb)) return va - vb;
      const sa = String(a?.[sortKey] ?? a?.absoluteNumber ?? a?.number ?? '');
      const sb = String(b?.[sortKey] ?? b?.absoluteNumber ?? b?.number ?? '');
      return sa.localeCompare(sb);
    });
    if (sortMode === 'descending') copy.reverse();
    return copy;
  }, [items, showSort, sortKey, sortMode]);

  // se tiver react-window, usa
  if (FixedSizeListComp) {
    const Comp = FixedSizeListComp;
    return (
      <>
        {showSort && (
          <HStack justify="end" mb={2}>
            <Text color="gray.300" fontSize="sm">Order:</Text>
            <Button size="sm" onClick={() => setSortMode(m => m === 'ascending' ? 'descending' : 'ascending')}>
              {sortMode === 'ascending' ? 'Ascending' : 'Descending'}
            </Button>
          </HStack>
        )}
        <Comp 
          height={height} 
          itemCount={sortedItems.length} 
          itemSize={rowHeight} 
          width={width} 
          overscanCount={overscan}
        >
          {({ index, style }) => renderItem({ item: sortedItems[index], index, style })}
        </Comp>
      </>
    );
  }

  // fallback: react-window não disponível — renderiza lista simples para garantir conteúdo visível
  logger?.warn?.('react-window not available, rendering fallback list');
  return (
    <Box width={width}>
      {showSort && (
        <HStack justify="end" mb={2}>
          <Text color="gray.300" fontSize="sm">Order:</Text>
          <Button size="sm" onClick={() => setSortMode(m => m === 'ascending' ? 'descending' : 'ascending')}>
            {sortMode === 'ascending' ? 'Ascending' : 'Descending'}
          </Button>
        </HStack>
      )}
      <VStack spacing={3} align="stretch">
        {sortedItems.map((item, idx) => (
          <Box key={item.uid ?? item.id ?? idx}>
            {renderItem({ item, index: idx, style: undefined })}
          </Box>
        ))}
      </VStack>
    </Box>
  );
}

export default React.memo(VirtualListInner, (prev, next) => {
  return (
    prev.items === next.items &&
    prev.rowHeight === next.rowHeight &&
    prev.height === next.height &&
    prev.width === next.width &&
    prev.overscan === next.overscan &&
    prev.showSort === next.showSort &&
    prev.sortKey === next.sortKey &&
    prev.renderItem === next.renderItem
  );
});
