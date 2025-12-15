import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalBody,
  ModalCloseButton,
  Box,
  VStack,
  HStack,
  Grid,
  Text,
  Button,
  Avatar,
  Input,
  Icon,
  IconButton,
  Heading,
  useColorMode,
  Divider,
  usePrefersReducedMotion,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Image,
  Badge,
  Progress,
} from '@chakra-ui/react';
import {
  IoMoonSharp,
  IoSunnySharp,
  IoCameraSharp,
  IoCheckmarkCircle,
  IoTimeSharp,
  IoPauseCircle,
  IoListSharp,
  IoTrophy,
  IoCalendar,
  IoStatsChart,
  IoColorPalette,
  IoMedal,
  IoPlaySharp,
  IoCheckmarkDoneSharp,
  IoTimerSharp,
  IoFlash,
  IoDocumentText,
} from 'react-icons/io5';
import { Global } from '@emotion/react';
import AnimeCard from './AnimeCard';
import ExpandedStatsSection from './ExpandedStatsSection';
import logger from '../../utils/helpers/logger.js';

// Mockando pra ver como fica
const mockData = {
  watching: [
    { 
      id: 1, 
      title: 'Jujutsu Kaisen', 
      episodes: 12, 
      watched: 8,
      cover: 'https://media.kitsu.io/anime/cover_images/42663/large-8cc0b944cce08f5c60f0f0b7fb0a6cb2.jpeg',
      score: 8.2,
    },
    { 
      id: 2, 
      title: 'Attack on Titan', 
      episodes: 13, 
      watched: 5,
      cover: 'https://media.kitsu.io/anime/cover_images/7442/large-6ad97c36376bb9cd910c10e1b0e4e919.jpeg',
      score: 8.9,
    },
  ],
  planning: [
    { 
      id: 3, 
      title: 'Demon Slayer', 
      episodes: 24,
      cover: 'https://media.kitsu.io/anime/cover_images/37513/large-c20ba0c61dd0dbf1f9c55325b48b4eeb.jpeg',
      score: 8.5,
    },
    { 
      id: 4, 
      title: 'My Hero Academia', 
      episodes: 12,
      cover: 'https://media.kitsu.io/anime/cover_images/9253/large-84b478da0a41e65a4e38146d25522dc4.jpeg',
      score: 7.8,
    },
  ],
  completed: [
    { 
      id: 5, 
      title: 'Steins;Gate', 
      episodes: 12,
      cover: 'https://media.kitsu.io/anime/cover_images/9253/large-84b478da0a41e65a4e38146d25522dc4.jpeg',
      score: 8.8,
    },
    { 
      id: 6, 
      title: 'Naruto', 
      episodes: 13,
      cover: 'https://media.kitsu.io/anime/cover_images/842/large-5ad7ac1c60705d7d8dfbe6f8e00c5bbf.jpeg',
      score: 8.6,
    },
  ],
  paused: [
    { 
      id: 7, 
      title: 'One Piece', 
      episodes: 1000,
      cover: 'https://media.kitsu.io/anime/cover_images/12/large-5ad7ac1c60705d7d8dfbe6f8e00c5bbf.jpeg',
      score: 9.0,
    },
  ],
  dropped: [
    { 
      id: 8, 
      title: 'Boruto', 
      episodes: 200,
      cover: 'https://media.kitsu.io/anime/cover_images/13/large-5ad7ac1c60705d7d8dfbe6f8e00c5bbf.jpeg',
      score: 5.5,
    },
  ],
  recentActivity: [
    { 
      id: 9, 
      title: 'Jujutsu Kaisen', 
      episode: 5, 
      date: '2 dias atrás',
      cover: 'https://media.kitsu.io/anime/cover_images/42663/large-8cc0b944cce08f5c60f0f0b7fb0a6cb2.jpeg',
    },
    { 
      id: 10, 
      title: 'Attack on Titan', 
      episode: 10, 
      date: '1 semana atrás',
      cover: 'https://media.kitsu.io/anime/cover_images/7442/large-6ad97c36376bb9cd910c10e1b0e4e919.jpeg',
    },
    { 
      id: 11, 
      title: 'Demon Slayer', 
      episode: 3, 
      date: '2 semanas atrás',
      cover: 'https://media.kitsu.io/anime/cover_images/37513/large-c20ba0c61dd0dbf1f9c55325b48b4eeb.jpeg',
    },
  ],
  stats: {
    totalMinutesWatched: 15240,
    totalEpisodes: 125,
    averageScore: 7.8,
    favoriteGenres: [
      { name: 'Ação', count: 18, percentage: 35 },
      { name: 'Drama', count: 12, percentage: 25 },
      { name: 'Fantasia', count: 10, percentage: 20 },
      { name: 'Comedia', count: 8, percentage: 15 },
    ],
    streakDays: 12,
    lastUpdated: '2 horas atrás',
    joinDate: '15 de Mar, 2023',
    averageEpisodesPerWeek: 4.2,
  },
  badges: [
    { id: 1, name: 'Veterano', description: '100+ animes completos', icon: IoTrophy, color: 'gold' },
    { id: 2, name: 'Maratonista', description: 'Terminou um anime em 24h', icon: IoTimeSharp, color: 'blue' },
    { id: 3, name: 'Fã de Shounen', description: '50+ Shounen vistos', icon: IoCheckmarkCircle, color: 'red' },
  ],
  calendar: [
    { id: 1, title: 'Jujutsu Kaisen', episode: 9, date: 'Hoje', time: '18:00' },
    { id: 2, title: 'Attack on Titan', episode: 6, date: 'Amanhã', time: '20:00' },
  ],
};

const StatCard = React.memo(({ icon, label, value, color = 'purple' }) => (
  <Box
    bg="linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)"
    border="1px solid"
    borderColor="whiteAlpha.200"
    borderRadius="md"
    p={2}
    textAlign="center"
    css={{ contain: 'layout paint' }}
    transition="all 0.2s"
    _hover={{ borderColor: 'whiteAlpha.400', transform: 'translateY(-2px)' }}
  >
    <Icon as={icon} fontSize="lg" color={`${color}.300`} mb={0.5} />
    <Text fontSize="9px" color="gray.300" mb={0.5} fontWeight="500">
      {label}
    </Text>
    <Text fontSize="sm" fontWeight="bold" color="gray.50">
      {value}
    </Text>
  </Box>
));

StatCard.displayName = 'StatCard';

const AnimeRow = React.memo(({ title, emoji, items, isWatching, isCompleted, size = "small" }) => (
  <Box w="100%">
    <Heading size="sm" mb={2} color="gray.100">
      {emoji} {title}
    </Heading>
    <Grid 
      templateColumns={`repeat(auto-fill, minmax(120px, 1fr))`} 
      gap={2} 
      w="100%"
      css={{ contain: 'layout paint' }}
    >
      {items.map((anime) => (
        <AnimeCard 
          key={anime.id} 
          anime={anime} 
          isWatching={isWatching}
          isCompleted={isCompleted}
          size={size}
        />
      ))}
    </Grid>
  </Box>
));

AnimeRow.displayName = 'AnimeRow';

const RecentActivity = React.memo(() => (
  <Box w="100%" mb={4}>
    <HStack spacing={2} mb={3}>
      <Icon as={IoDocumentText} color="purple.300" fontSize="lg" />
      <Heading size="sm" color="gray.100" fontWeight="bold">
        Atividade Recente
      </Heading>
    </HStack>
    <VStack spacing={2} align="stretch">
      {mockData.recentActivity.map((activity) => (
        <HStack 
          key={activity.id} 
          spacing={3} 
          p={3} 
          bg="#1a1a1a"
          borderRadius="lg" 
          border="1px solid"
          borderColor="whiteAlpha.200"
          transition="all 0.2s"
          _hover={{ borderColor: 'purple.400', bg: '#1f1f2e' }}
        >
          <Image src={activity.cover} alt={activity.title} boxSize="45px" objectFit="cover" borderRadius="md" />
          <VStack align="start" spacing={0} flex={1}>
            <Text fontSize="sm" color="gray.100" fontWeight="600">
              {activity.title} - Ep {activity.episode}
            </Text>
            <Text fontSize="xs" color="gray.500">
              {activity.date}
            </Text>
          </VStack>
        </HStack>
      ))}
    </VStack>
  </Box>
));

RecentActivity.displayName = 'RecentActivity';

const BadgeItem = React.memo(({ badge }) => (
  <HStack 
    spacing={2} 
    p={2.5} 
    bg="#1a1a1a"
    borderRadius="lg" 
    border="1px solid"
    borderColor="whiteAlpha.200"
    transition="all 0.2s"
    _hover={{ borderColor: `${badge.color}.400`, bg: '#1f1f2e' }}
  >
    <Icon as={badge.icon} color={`${badge.color}.300`} fontSize="lg" />
    <VStack align="start" spacing={0} flex={1}>
      <Text fontSize="sm" color="gray.100" fontWeight="600">{badge.name}</Text>
      <Text fontSize="xs" color="gray.500">{badge.description}</Text>
    </VStack>
  </HStack>
));

BadgeItem.displayName = 'BadgeItem';

const CalendarItem = React.memo(({ item }) => (
  <HStack 
    spacing={3} 
    p={2.5} 
    bg="#1a1a1a"
    borderRadius="lg" 
    border="1px solid"
    borderColor="whiteAlpha.200"
    transition="all 0.2s"
    _hover={{ borderColor: 'purple.400', bg: '#1f1f2e' }}
  >
    <Icon as={IoCalendar} color="purple.300" fontSize="lg" />
    <VStack align="start" spacing={0} flex={1}>
      <Text fontSize="sm" color="gray.100" fontWeight="600">{item.title} - Ep {item.episode}</Text>
      <Text fontSize="xs" color="gray.500">{item.date} às {item.time}</Text>
    </VStack>
  </HStack>
));

CalendarItem.displayName = 'CalendarItem';

const ConfigModal = ({ isOpen, onClose, userName = 'kyl', userPhotoUrl = '' }) => {
  const shouldReduceMotion = usePrefersReducedMotion();
  const [name, setName] = useState(userName);
  const [photoUrl, setPhotoUrl] = useState(userPhotoUrl);
  const [isEditingName, setIsEditingName] = useState(false);
  const { colorMode, toggleColorMode } = useColorMode();
  const contentRef = useRef(null);

  const handleNameChange = useCallback((e) => {
    setName(e.target.value);
  }, []);

  const handleSaveName = useCallback(() => {
    logger.info('Nome salvo:', name);
    setIsEditingName(false);
  }, [name]);

  const handlePhotoChange = useCallback(() => {
    logger.log('Foto alterada');
  }, []);

  const memoizedStats = useMemo(() => (
    [
      { icon: IoCheckmarkCircle, label: 'Completos', value: mockData.completed.length, color: 'green' },
      { icon: IoTimeSharp, label: 'Em Andamento', value: mockData.watching.length, color: 'blue' },
      { icon: IoPauseCircle, label: 'Planejando', value: mockData.planning.length, color: 'orange' },
      { icon: IoListSharp, label: 'Pausados', value: mockData.paused.length, color: 'cyan' },
    ]
  ), []);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size={{ base: 'full', md: 'xl', lg: '6xl' }} isCentered scrollBehavior="inside">
      <Global
        styles={shouldReduceMotion ? `
          * {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        ` : ''}
      />
      <ModalOverlay backdropFilter={shouldReduceMotion ? 'none' : 'blur(4px)'} />
      <ModalContent
        bg="#0a0a0a"
        maxHeight={{ base: '100vh', md: '90vh', lg: '85vh' }}
        borderRadius={{ base: 'none', md: 'xl' }}
        display="flex"
        flexDirection="column"
        border="1px solid"
        borderColor="whiteAlpha.300"
        css={{ contain: 'layout style paint' }}
      >
        <Box
          display="flex"
          justifyContent="flex-end"
          p={4}
          borderBottom="1px solid"
          borderColor="whiteAlpha.300"
          flexShrink={0}
        >
          <ModalCloseButton 
            color="gray.200" 
            size="lg"
            position="relative"
            top={0}
            right={0}
          />
        </Box>

        <ModalBody py={4} px={{ base: 3, md: 6 }} flex={1} ref={contentRef}>
          <HStack 
            spacing={{ base: 0, lg: 6 }}
            align="flex-start" 
            w="100%"
            flexDirection={{ base: 'column', lg: 'row' }}
          >
            <VStack 
              spacing={3} 
              align="stretch" 
              w={{ base: '100%', lg: '40%' }} 
              minW={{ base: 'auto', lg: '280px' }}
            >

              <Box position="relative" alignSelf="center" mb={2} flexShrink={0}>
                <Box
                  borderRadius="full"
                  p={1}
                  bg="linear-gradient(135deg, #7c3aed, #a855f7)"
                >
                  <Avatar size={{ base: 'lg', md: '2xl' }} name={name} src={photoUrl} bg="purple.600" />
                </Box>
                <IconButton
                  icon={<IoCameraSharp />}
                  size="sm"
                  position="absolute"
                  bottom={0}
                  right={0}
                  borderRadius="full"
                  colorScheme="purple"
                  bg="purple.600"
                  _hover={{ bg: 'purple.700' }}
                  onClick={handlePhotoChange}
                  aria-label="Mudar foto"
                />
              </Box>

              {isEditingName ? (
                <HStack spacing={2} flexShrink={0}>
                  <Input
                    value={name}
                    onChange={handleNameChange}
                    size="sm"
                    fontSize="xs"
                    fontWeight="bold"
                    color="gray.100"
                    bg="#1a1a1a"
                    border="1px solid"
                    borderColor="purple.500"
                    placeholder="Nome"
                    _focus={{ borderColor: 'purple.400', boxShadow: '0 0 0 3px rgba(168, 85, 247, 0.2)' }}
                  />
                  <Button size="xs" colorScheme="purple" onClick={handleSaveName}>
                    OK
                  </Button>
                </HStack>
              ) : (
                <HStack spacing={1} justify="center" flexShrink={0}>
                  <Heading size="xs" color="gray.100">
                    {name}
                  </Heading>
                  <Button size="xs" variant="ghost" onClick={() => setIsEditingName(true)} color="purple.300">
                    ✎
                  </Button>
                </HStack>
              )}

              <Box flexShrink={0} w="100%">
                <VStack spacing={3} align="stretch">
                  <Box>
                    <HStack spacing={2} mb={2}>
                      <Icon as={IoTimeSharp} color="purple.300" fontSize="sm" />
                      <Text fontSize="xs" fontWeight="bold" color="purple.300">Tempo</Text>
                    </HStack>
                    <VStack spacing={1} align="stretch" pl={2} borderLeft="2px solid" borderColor="purple.600">
                      <Text fontSize={{ base: '11px', md: 'sm' }} color="gray.200">Volume: <Text as="span" color="purple.200" fontWeight="bold">{Math.floor(mockData.stats.totalMinutesWatched / 60)}h</Text></Text>
                      <Text fontSize={{ base: '11px', md: 'sm' }} color="gray.200">Break: <Text as="span" color="purple.200" fontWeight="bold">{mockData.stats.streakDays}d</Text></Text>
                    </VStack>
                  </Box>
                  <Box>
                    <HStack spacing={2} mb={2}>
                      <Icon as={IoStatsChart} color="blue.300" fontSize="sm" />
                      <Text fontSize="xs" fontWeight="bold" color="blue.300">Atividade</Text>
                    </HStack>
                    <VStack spacing={1} align="stretch" pl={2} borderLeft="2px solid" borderColor="blue.600">
                      <Text fontSize={{ base: '11px', md: 'sm' }} color="gray.200">Operações: <Text as="span" color="blue.200" fontWeight="bold">{mockData.stats.totalEpisodes}</Text></Text>
                      <Text fontSize={{ base: '11px', md: 'sm' }} color="gray.200">Eps/Semana: <Text as="span" color="blue.200" fontWeight="bold">{mockData.stats.averageEpisodesPerWeek}</Text></Text>
                    </VStack>
                  </Box>
                  <Box>
                    <HStack spacing={2} mb={2}>
                      <Icon as={IoFlash} color="yellow.300" fontSize="sm" />
                      <Text fontSize="xs" fontWeight="bold" color="yellow.300">Avaliação</Text>
                    </HStack>
                    <VStack spacing={1} align="stretch" pl={2} borderLeft="2px solid" borderColor="yellow.600">
                      <Text fontSize={{ base: '11px', md: 'sm' }} color="gray.200">Score Médio: <Text as="span" color="yellow.200" fontWeight="bold">{mockData.stats.averageScore}/10</Text></Text>
                    </VStack>
                  </Box>
                </VStack>
              </Box>

              <Divider borderColor="whiteAlpha.300" my={2} flexShrink={0} />

              <Box flexShrink={0} w="100%">
                <HStack spacing={2} mb={2}>
                  <Icon as={IoColorPalette} color="pink.300" fontSize="sm" />
                  <Text fontSize="xs" fontWeight="bold" color="pink.300">Gêneros Favoritos</Text>
                </HStack>
                <VStack spacing={2} align="stretch">
                  {mockData.stats.favoriteGenres.map((genre) => (
                    <HStack key={genre.name} justify="space-between" fontSize={{ base: '10px', md: 'sm' }}>
                      <Text color="gray.200">{genre.name}</Text>
                      <HStack spacing={1}>
                        <Text color="purple.300" fontSize="9px" fontWeight="bold">{genre.count}</Text>
                        <Progress value={genre.percentage} size="sm" colorScheme="purple" w={{ base: '30px', md: '40px' }} bg="#1a1a1a" />
                      </HStack>
                    </HStack>
                  ))}
                </VStack>
              </Box>

              <Divider borderColor="whiteAlpha.300" my={2} flexShrink={0} />

              <Box flexShrink={0} w="100%">
                <HStack spacing={2} mb={2}>
                  <Icon as={IoMedal} color="green.300" fontSize="sm" />
                  <Text fontSize="xs" fontWeight="bold" color="green.300">Conquistas</Text>
                </HStack>
                <VStack spacing={2} align="stretch">
                  {mockData.badges.map((badge) => (
                    <BadgeItem key={badge.id} badge={badge} />
                  ))}
                </VStack>
              </Box>

              <Divider borderColor="whiteAlpha.300" my={2} flexShrink={0} />

              <Box flexShrink={0} w="100%">
                <HStack spacing={2} mb={2}>
                  <Icon as={IoCalendar} color="cyan.300" fontSize="sm" />
                  <Text fontSize="xs" fontWeight="bold" color="cyan.300">Calendário</Text>
                </HStack>
                <VStack spacing={2} align="stretch">
                  {mockData.calendar.map((item) => (
                    <CalendarItem key={item.id} item={item} />
                  ))}
                </VStack>
              </Box>

              <Divider borderColor="whiteAlpha.300" my={2} flexShrink={0} />

              <Button
                size="sm"
                w="100%"
                leftIcon={colorMode === 'light' ? <IoSunnySharp /> : <IoMoonSharp />}
                colorScheme="purple"
                bg="purple.600"
                _hover={{ bg: 'purple.700' }}
                onClick={toggleColorMode}
                fontSize="xs"
                flexShrink={0}
              >
                {colorMode === 'light' ? 'Escuro' : 'Claro'}
              </Button>
            </VStack>

            <Divider 
              orientation={{ base: 'horizontal', lg: 'vertical' }} 
              borderColor="whiteAlpha.300"
              my={{ base: 4, lg: 0 }}
              mx={{ base: 0, lg: 2 }}
            />

            <VStack 
              spacing={4} 
              align="stretch" 
              w={{ base: '100%', lg: '60%' }}
            >
              <RecentActivity />
              <Tabs variant="enclosed" colorScheme="purple" isFitted w="100%">
                <TabList 
                  overflowX={{ base: 'auto', md: 'visible' }} 
                  overflowY="hidden"
                  borderColor="whiteAlpha.300"
                >
                  <Tab 
                    fontSize={{ base: 'xs', md: 'sm' }} 
                    whiteSpace="nowrap"
                    color="gray.400"
                    _selected={{ color: 'gray.100', borderColor: 'purple.500', bg: 'whiteAlpha.50' }}
                  >
                    <HStack spacing={1}>
                      <Icon as={IoPlaySharp} fontSize="sm" />
                      <Text>Em Andamento</Text>
                    </HStack>
                  </Tab>
                  <Tab 
                    fontSize={{ base: 'xs', md: 'sm' }} 
                    whiteSpace="nowrap"
                    color="gray.400"
                    _selected={{ color: 'gray.100', borderColor: 'purple.500', bg: 'whiteAlpha.50' }}
                  >
                    <HStack spacing={1}>
                      <Icon as={IoCheckmarkDoneSharp} fontSize="sm" />
                      <Text>Completos</Text>
                    </HStack>
                  </Tab>
                  <Tab 
                    fontSize={{ base: 'xs', md: 'sm' }} 
                    whiteSpace="nowrap"
                    color="gray.400"
                    _selected={{ color: 'gray.100', borderColor: 'purple.500', bg: 'whiteAlpha.50' }}
                  >
                    <HStack spacing={1}>
                      <Icon as={IoTimerSharp} fontSize="sm" />
                      <Text>Planejando</Text>
                    </HStack>
                  </Tab>
                  <Tab 
                    fontSize={{ base: 'xs', md: 'sm' }} 
                    whiteSpace="nowrap" 
                    display={{ base: 'none', lg: 'flex' }}
                    color="gray.400"
                    _selected={{ color: 'gray.100', borderColor: 'purple.500', bg: 'whiteAlpha.50' }}
                  >
                    <HStack spacing={1}>
                      <Icon as={IoPauseCircle} fontSize="sm" />
                      <Text>Pausados</Text>
                    </HStack>
                  </Tab>
                  <Tab 
                    fontSize={{ base: 'xs', md: 'sm' }} 
                    whiteSpace="nowrap" 
                    display={{ base: 'none', lg: 'flex' }}
                    color="gray.400"
                    _selected={{ color: 'gray.100', borderColor: 'purple.500', bg: 'whiteAlpha.50' }}
                  >
                    <HStack spacing={1}>
                      <Icon as={IoListSharp} fontSize="sm" />
                      <Text>Dropados</Text>
                    </HStack>
                  </Tab>
                </TabList>
                <TabPanels>
                  <TabPanel p={{ base: 2, md: 4 }}>
                    <AnimeRow items={mockData.watching} isWatching size="small" />
                  </TabPanel>
                  <TabPanel p={{ base: 2, md: 4 }}>
                    <AnimeRow items={mockData.completed} isCompleted size="small" />
                  </TabPanel>
                  <TabPanel p={{ base: 2, md: 4 }}>
                    <AnimeRow items={mockData.planning} size="small" />
                  </TabPanel>
                  <TabPanel p={{ base: 2, md: 4 }} display={{ base: 'none', lg: 'block' }}>
                    <AnimeRow items={mockData.paused} size="small" />
                  </TabPanel>
                  <TabPanel p={{ base: 2, md: 4 }} display={{ base: 'none', lg: 'block' }}>
                    <AnimeRow items={mockData.dropped} size="small" />
                  </TabPanel>
                </TabPanels>
              </Tabs>
            </VStack>
          </HStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default React.memo(ConfigModal);
ConfigModal.displayName = 'ConfigModal';
