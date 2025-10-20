import { sleep } from '../helpers/selecter.js';
import logger from '../helpers/logger.js';

export async function fetch_anizip_data(fetchParam) {
  const results = [];

  if (!fetchParam) {
    logger.warn('⚠️ Nenhum id fornecido para AniZip');
    return results;
  }

  // permite receber um objeto com { anilist_id, mal_id } ou um id primitivo
  let anilistCandidate = null;
  let malCandidate = null;
  if (typeof fetchParam === 'object' && fetchParam !== null) {
    anilistCandidate = fetchParam.anilist_id || fetchParam.id || null;
    malCandidate = fetchParam.mal_id || fetchParam.idMal || null;
  } else {
    // valor primitivo: assume Anilist ID primeiro
    anilistCandidate = fetchParam;
  }

  // tenta Anilist primeiro, depois MAL se disponível
  const tryOrder = [];
  if (anilistCandidate) tryOrder.push({ type: 'anilist_id', value: Number(anilistCandidate) });
  if (malCandidate) tryOrder.push({ type: 'mal_id', value: Number(malCandidate) });

  if (tryOrder.length === 0) {
    logger.warn('⚠️ Nenhum candidato anilist_id/mal_id válido fornecido');
    return results;
  }

  let mapping = null;

  for (const candidate of tryOrder) {
    const idValue = candidate.value;
    if (!idValue || Number.isNaN(idValue)) continue;

    const paramName = candidate.type;
  logger.debug(`🔍 Buscando no AniZip (${paramName}):`, idValue);

    try {
      const url = `https://api.ani.zip/mappings?${paramName}=${encodeURIComponent(idValue)}`;
      const resp = await fetch(url);
      if (!resp.ok) {
        logger.warn(`AniZip retornou erro para ${paramName}=${idValue}:`, resp.status);
        // se falhar, tenta o próximo candidato
        continue;
      }

      const json = await resp.json();
      mapping = json;
      break;
    } catch (err) {
      logger.warn(`Erro na requisição AniZip para ${paramName}=${idValue}:`, err);
      continue;
    }
  }

  if (!mapping) {
    return results;
  }
  
  // retorna apenas os dados dos episódios (o resto vem do searchbar)
  const data = {
    episodeList: [], // lista detalhada de episódios
    episodeCount: mapping.episodeCount || null
  };

    // Processar episódios
    if (mapping.episodes) {
      const keys = Object.keys(mapping.episodes).sort((a,b) => Number(a)-Number(b));
      
  logger.info(`📊 Total de episódios brutos da API: ${keys.length}`);
      
      // filtra apenas episódios que têm chave numérica (ex: "13", "42")
      // ignora episódios com chaves alfanuméricas (ex: "S3", "OVA1") que são especiais
      const validKeys = keys.filter(key => {
        // a chave deve ser apenas números
        if (!/^\d+$/.test(key)) {
          return false;
        }
        
        const ep = mapping.episodes[key];
        
        // exclui se não tiver informações básicas
        const hasTitle = ep.title?.en || ep.title?.ja || ep.title?.['x-jat'];
        if (!hasTitle && !ep.overview && !ep.summary && !ep.image) {
          return false;
        }
        
        return true;
      });
      
  logger.info(`✅ Episódios após filtro: ${validKeys.length} (removidos ${keys.length - validKeys.length} especiais/OVAs)`);
      
      if (validKeys.length > 0) {
        // data atual para verificar episódios já transmitidos
        const now = new Date();
        
        // formata lista completa de episódios
          data.episodeList = validKeys.map((key) => {
          const ep = mapping.episodes[key];
          const parsedNumber = Number.isFinite(Number(ep.episodeNumber)) ? Number(ep.episodeNumber) : (Number.isFinite(Number(ep.absoluteEpisodeNumber)) ? Number(ep.absoluteEpisodeNumber) : Number(key));
          const parsedAbsolute = Number.isFinite(Number(ep.absoluteEpisodeNumber)) ? Number(ep.absoluteEpisodeNumber) : parsedNumber;
          const uidBase = (mapping.mappings?.anilist_id || 'anon').toString();
          const uid = `${uidBase}-key-${key}`;

          // verifica se o episódio já foi transmitido
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

    // empacota um termo representativo (prefere mapping.mappings.anilist_id ou mal_id, senão o primeiro candidato)
    const usedIdForTerm = mapping.mappings?.anilist_id || mapping.mappings?.mal_id || (tryOrder[0] && tryOrder[0].value) || null;
    results.push({ term: usedIdForTerm, data });

    // pequeno sleep para não flodar caso seja chamado em loop
    await sleep(200);

    return results;
}
