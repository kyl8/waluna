import { sleep } from '../helpers/selecter.js';
import logger from '../helpers/logger.js';

export async function fetch_anizip_data(fetchParam) {
  const results = [];

  if (!fetchParam) {
    logger.warn('⚠️ Sem id fornecido para AniZip');
    return results;
  }

  // accept object { anilist_id, mal_id } or a primitive id
  let anilistCandidate = null;
  let malCandidate = null;
  if (typeof fetchParam === 'object' && fetchParam !== null) {
    anilistCandidate = fetchParam.anilist_id || fetchParam.id || null;
    malCandidate = fetchParam.mal_id || fetchParam.idMal || null;
  } else {
    // primitive value: assume Anilist ID first
    anilistCandidate = fetchParam;
  }

  // tries Anilist first, then MAL if available
  const tryOrder = [];
  if (anilistCandidate) tryOrder.push({ type: 'anilist_id', value: Number(anilistCandidate) });
  if (malCandidate) tryOrder.push({ type: 'mal_id', value: Number(malCandidate) });

  if (tryOrder.length === 0) {
    logger.warn('⚠️ Sem id válido fornecido para AniZip');
    return results;
  }

  let mapping = null;

  for (const candidate of tryOrder) {
    const idValue = candidate.value;
    if (!idValue || Number.isNaN(idValue)) continue;

    const paramName = candidate.type;
    logger.debug(`🔍 pesquisando (${paramName}):`, idValue);

    try {
      const url = `https://api.ani.zip/mappings?${paramName}=${encodeURIComponent(idValue)}`;
      const resp = await fetch(url);
      if (!resp.ok) {
        logger.warn(`Anizip retornou erro: ${paramName}=${idValue}:`, resp.status);
        continue;
      }

      const json = await resp.json();
      mapping = json;
      break;
    } catch (err) {
      logger.warn(`Erro de request: ${paramName}=${idValue}:`, err);
      continue;
    }
  }

  if (!mapping) {
    return results;
  }
  
  // return episode data only (search provides the rest)
  const data = {
    episodeList: [],
    episodeCount: mapping.episodeCount || null
  };

  // process episodes
  if (mapping.episodes) {
    const keys = Object.keys(mapping.episodes).sort((a,b) => Number(a)-Number(b));

    logger.info(`📊 total de episódios brutos da API: ${keys.length}`);

    // filter numeric episode keys and exclude special/OVA keys
    const validKeys = keys.filter(key => {
        // the key must be only numbers
        if (!/^\d+$/.test(key)) {
          return false;
        }
        
        const ep = mapping.episodes[key];
        
        // exclude if no basic info
        const hasTitle = ep.title?.en || ep.title?.ja || ep.title?.['x-jat'];
        if (!hasTitle && !ep.overview && !ep.summary && !ep.image) {
          return false;
        }
        
        return true;
      });

    logger.info(`✅ episódios após filtro: ${validKeys.length} (removidos ${keys.length - validKeys.length} specials/ovas)`);

    if (validKeys.length > 0) {
      // current date to check aired episodes
      const now = new Date();
      
      // format complete episode list
        data.episodeList = validKeys.map((key) => {
        const ep = mapping.episodes[key];
        const parsedNumber = Number.isFinite(Number(ep.episodeNumber)) ? Number(ep.episodeNumber) : (Number.isFinite(Number(ep.absoluteEpisodeNumber)) ? Number(ep.absoluteEpisodeNumber) : Number(key));
        const parsedAbsolute = Number.isFinite(Number(ep.absoluteEpisodeNumber)) ? Number(ep.absoluteEpisodeNumber) : parsedNumber;
        const uidBase = (mapping.mappings?.anilist_id || 'anon').toString();
        const uid = `${uidBase}-key-${key}`;

        // check if episode has aired
        const airDateStr = ep.airDate || ep.airdate || ep.airDateUtc || ep.airdateUtc;
        let isAired = false;
        
        if (airDateStr) {
          try {
            const airDate = new Date(airDateStr);
            isAired = airDate <= now;
          } catch {
            isAired = false;
          }
        }

        return {
          uid,
          number: parsedNumber,
          absoluteNumber: parsedAbsolute,
          title: ep.title?.en || ep.title?.ja || ep.title?.['x-jat'] || `Episode ${key}`,
          overview: ep.overview || ep.summary || '',
          image: ep.image || '',
          airDate: airDateStr || '',
          runtime: ep.runtime || ep.length || null,
          season: Number(ep.seasonNumber) || 1,
          isAired: isAired
        };
      });
      
    logger.info(`📺 Total de episódios processados: ${data.episodeList.length}`);
    }
  }

  // pack a representative term (prefers mapping.mappings.anilist_id or mal_id, else first candidate)
  const usedIdForTerm = mapping.mappings?.anilist_id || mapping.mappings?.mal_id || (tryOrder[0] && tryOrder[0].value) || null;
  results.push({ term: usedIdForTerm, data });

  // small sleep to avoid flooding if called in a loop
  await sleep(200);

  return results;
}
