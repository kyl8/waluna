import React, { useCallback, useEffect, useState } from 'react';
import { HStack, IconButton, Tooltip } from '@chakra-ui/react';
import { FaArrowLeft, FaArrowRight, FaHeart, FaRegHeart, FaDownload, FaSave } from 'react-icons/fa';
import { getOptimalDuration, subscribeFrameRate, unsubscribeFrameRate } from '../utils/helpers/animation.js';

const PlayerControls = ({ isFavorited, onFavoriteToggle }) => {
  const handleFavoriteClick = useCallback(() => {
    onFavoriteToggle?.();
  }, [onFavoriteToggle]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const cb = () => setTick(t => t + 1);
    const unsub = subscribeFrameRate(cb);
    return () => { try { unsub(); } catch (e) { unsubscribeFrameRate(cb); } };
  }, []);

  const transitionDuration = getOptimalDuration(120);

  const iconButtonProps = {
    size: "lg",
    isRound: true,
    variant: "outline",
    colorScheme: "purple",
    color: "purple.300",
    _hover: {
      bg: 'rgba(159, 122, 234, 0.15)',
      boxShadow: '0 4px 12px rgba(159, 122, 234, 0.2)'
    },
    _active: {
      bg: 'rgba(159, 122, 234, 0.25)'
    },
    transition: `background-color ${transitionDuration}ms ease, box-shadow ${transitionDuration}ms ease`
  };

  return (
    <HStack
      spacing={{ base: 2, md: 4, lg: 6 }}
      mt={4}
      p={4}
      bg="#111111"
      borderRadius="2xl"
      width={{ base: '95%', md: '75%', lg: '60%', xl: '50%' }}
      justifyContent="center"
      border="1px solid #2d2d2d"
      wrap="wrap"
      mx="auto"
    >
      <Tooltip label="Episódio Anterior" placement="top">
        <IconButton aria-label="Episódio anterior" icon={<FaArrowLeft />} {...iconButtonProps} />
      </Tooltip>

      <Tooltip label={isFavorited ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos'} placement="top">
        <IconButton aria-label="Favoritar" icon={isFavorited ? <FaHeart color="#FC8181" /> : <FaRegHeart />} onClick={handleFavoriteClick} {...iconButtonProps} />
      </Tooltip>

      <Tooltip label="Próximo Episódio" placement="top">
        <IconButton aria-label="Próximo episódio" icon={<FaArrowRight />} {...iconButtonProps} />
      </Tooltip>

      <Tooltip label="Baixar Episódio" placement="top">
        <IconButton aria-label="Baixar episódio" icon={<FaDownload />} {...iconButtonProps} />
      </Tooltip>

      <Tooltip label="Salvar Progresso" placement="top">
        <IconButton aria-label="Salvar progresso" icon={<FaSave />} {...iconButtonProps} />
      </Tooltip>
    </HStack>
  );
};

export default React.memo(PlayerControls, (prevProps, nextProps) => {
  return prevProps.isFavorited === nextProps.isFavorited && prevProps.onFavoriteToggle === nextProps.onFavoriteToggle;
});