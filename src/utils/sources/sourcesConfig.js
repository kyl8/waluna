import * as animefireApi from '../api/animefire.js';
import * as tomatoApi from '../api/tomato.js';
import { FaFire } from 'react-icons/fa';
import { GiTomato } from 'react-icons/gi';
import { GiMagnet } from 'react-icons/gi';

export const getSourceIcon = (sourceId) => {
  const icons = {
    animefire: FaFire,
    tomato: GiTomato,
    torrent: GiMagnet,
  };
  return icons[sourceId] || FaFire;
};

export const SOURCES = {
  animefire: {
    id: 'animefire',
    name: 'ANIMEFIRE',
    color: 'purple',
    icon: 'fire',
    apiModule: animefireApi,
    fetchEpisodes: animefireApi.getFormattedEpisodes,
    fetchVideoLinks: animefireApi.getFormattedStreamingLinks,
    enableSubtitles: true,
    description: 'Estável, mas com qualidade mediana.'
  },
  tomato: {
    id: 'tomato',
    name: 'TOMATOANIMES',
    color: 'orange',
    icon: 'tomato',
    apiModule: tomatoApi,
    fetchEpisodes: tomatoApi.getFormattedEpisodes,
    fetchVideoLinks: tomatoApi.getFormattedVideoLinks,
    enableSubtitles: true,
    description: 'Instável, mas com boa qualidade.'
  },
  torrent: {
    id: 'torrent',
    name: 'NYAA.SI',
    color: 'green',
    icon: 'magnet',
    apiModule: null,    
    fetchEpisodes: null,
    fetchVideoLinks: null,
    enableSubtitles: false,
    description: 'Torrent.'
  }
};

export const SOURCES_LIST = Object.values(SOURCES);

export const getSourceConfig = (sourceId) => {
  const config = SOURCES[sourceId];
  if (!config) {
    return SOURCES.animefire; // fallback
  }
  return config;
};

export const isStreamingSource = (sourceId) => {
  return sourceId !== 'torrent';
};

export const getEpisodesFetcher = (sourceId) => {
  const config = getSourceConfig(sourceId);
  return config.fetchEpisodes;
};

export const getVideoLinksFetcher = (sourceId) => {
  const config = getSourceConfig(sourceId);
  return config.fetchVideoLinks;
};

export default SOURCES;
