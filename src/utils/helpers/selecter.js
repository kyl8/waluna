import Fuse from 'fuse.js';
import names from '../../constants/names.json';
import logger from './logger.js';

let fuseWorker = null;
let nextWorkerRequestId = 1;
const pendingWorkerResponses = new Map();

function initWorker() {
  if (fuseWorker) return;
  try {
    // worker está em src/workers/fuse.worker.js — do arquivo src/utils/helpers/selecter.js
    fuseWorker = new Worker(new URL('../../workers/fuse.worker.js', import.meta.url));
    fuseWorker.onmessage = (ev) => {
      const { id, results, error } = ev.data || {};
      const resolver = pendingWorkerResponses.get(id);
      if (!resolver) return;
      pendingWorkerResponses.delete(id);
      if (error) return resolver(Promise.reject(new Error(error)));
      resolver(results || []);
    };
  } catch (e) {
    logger.warn('Could not initialize fuse worker, falling back to main thread', e);
    fuseWorker = null;
  }
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
} 
// processa o termo de busca e retorna um array de termos similares
export async function process_term(term) {
  if (!term || !term.trim()) return [];

  // try worker first
  initWorker();
  if (fuseWorker) {
    return await new Promise((resolve) => {
      const id = nextWorkerRequestId++;
      pendingWorkerResponses.set(id, (r) => resolve(r));
      fuseWorker.postMessage({ id, term });
      // fallback safety timeout
      setTimeout(() => {
        if (pendingWorkerResponses.has(id)) {
          pendingWorkerResponses.delete(id);
          resolve([]);
        }
      }, 3000);
    });
  }

  // fallback sync
  const fuse = new Fuse(names, { includeScore: true, threshold: 0.2 });
  const fuse_term = fuse.search(term);
  return fuse_term.map(result => result.item);
}

// compara titulos  e da um array com os retornos q dao match
export async function is_match(titles, term) {
    const fuse = new Fuse(titles, { includeScore: true, threshold: 0.2 });
    const result = fuse.search(term);
    return result.length > 0;
}

// verifica qual api esta disponivel e o tempo de resposta
export async function what_api_is_available(anime_name) {
  const result = { jikan: [false, 0], anilist: [false, 0] };

  // testa anilist api primeiro (sem rate limit)
  try {
    const query = `
      query ($search: String) {
        Media(search: $search, type: ANIME) {
          id
        }
      }
    `;
    const variables = { search: anime_name };

    let start_time = performance.now();
    const anilist = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query, variables })
    });
    let end_time = performance.now();

    if (anilist.ok) result.anilist = [true, Math.round(end_time - start_time)];
  } catch (err) {
    logger.error('AniList API error:', err);
  }

  // aguarda um pouco antes de testar jikan (rate limit de 1 req/sec)
  await sleep(2000);

  // testa jikan api
  try {
    let start_time = performance.now();
    const jikan = await fetch(
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(anime_name)}&limit=1`
    );
    let end_time = performance.now();
    if (jikan.ok) result.jikan = [true, Math.round(end_time - start_time)];
  } catch (e) {
    logger.error('Jikan API error:', e);
  }

  return result;
}

// seleciona a melhor api disponivel
export async function select_available_source(anime_name) {
  const availability = await what_api_is_available(anime_name);
  let best_source = null;

  const [jikanOk, jikanMs] = availability.jikan;
  const [anilistOk, anilistMs] = availability.anilist;

  if (jikanOk && anilistOk) {
    if (jikanMs <= anilistMs) {
      best_source = 'jikan';
    } else {
      best_source = 'anilist';
    }
  } else if (jikanOk) {
    best_source = 'jikan';
  } else if (anilistOk) {
    best_source = 'anilist';
  }

  const jikanStr = jikanOk ? `${jikanMs} ms` : 'N/A';
  const anilistStr = anilistOk ? `${anilistMs} ms` : 'N/A';

  return best_source
    ? `${best_source} (jikan: ${jikanStr}, anilist: ${anilistStr})`
    : null;
}

// select_available_source('mushishi').then(source => logger.debug(`Best source: ${source}`));
// what_api_is_available('Naruto').then(status => logger.debug(status));
// process_term('naruto').then(results => logger.debug(results));