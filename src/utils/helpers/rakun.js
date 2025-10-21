import rakun from "@lowlighter/rakun"
// simple function to format parser output. uses the torrent filename to parse and extract relevant info
// its merged with other torrent info parsed by the backend using rust and nyaa-si library 
// thanks to @lowlighter for the rakun library!
// thanks to @cijiugechu for the nyaa-si library!

export async function parse_nyaa(name) {
    const info = await fetch(`http://127.0.0.1:8080/search?&q=${name}&pretty=1`)
    return info.json()
}

const cleanObject = (obj) => {
    return Object.fromEntries(
        Object.entries(obj).filter(([_, value]) => value !== undefined)
    );
};

const parseDate = (dateString) => {
    if (!dateString) return undefined;
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return undefined;
    
    return {
        readable: date.toLocaleString('pt-BR', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        }),
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        hour: date.getHours(),
        minute: date.getMinutes(),
        second: date.getSeconds(),
        dayOfWeek: date.toLocaleString('pt-BR', { weekday: 'long' }),
        iso: date.toISOString()
    };
};

const sanitize = (str) => {
    return str
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')  
        .split(/[\s]+/)             
        .filter(w => w.length > 0)
        .join(' ');                 
};

export async function format_rakun(name) {
    const sanitizedName = sanitize(name);
    // console.log(`[format_rakun] Starting search for: "${name}" (sanitized: "${sanitizedName}")`);
    let rakun_parsed_info = []
    
    try {
        const info = await parse_nyaa(sanitizedName)
        // console.log(`[format_rakun] Nyaa API returned ${info.results?.length || 0} results`);
        
        info.results.forEach((element, idx) => {
            const parsed = rakun.parse(element.title || name);

        // parse sizes like "GB(6.78)" or "6.78 GB" into value/unit/bytes
        const parseSize = (s) => {
            if (!s) return undefined;
            const str = String(s).trim();
            let unit, value;

            // match "GB(6.78)" or "MiB(123.4)"
            let m = str.replace(/\s+/g, "").match(/^([KMGTPE]?i?B)\(([\d.,]+)\)$/i);
            if (m) {
            unit = m[1].toUpperCase();
            value = parseFloat(m[2].replace(",", "."));
            } else {
            // match "6.78 GB" or "6.78GB"
            m = str.match(/^([\d.,]+)\s*([KMGTPE]?i?B)$/i);
            if (!m) return undefined;
            value = parseFloat(m[1].replace(",", "."));
            unit = m[2].toUpperCase();
            }

            const isBinary = unit.endsWith("IB"); // KiB, MiB, GiB
            const normalizedUnit = isBinary ? unit.replace("IB", "B") : unit; // KiB -> KB
            const exp = { B: 0, KB: 1, MB: 2, GB: 3, TB: 4, PB: 5, EB: 6 }[normalizedUnit] ?? 0;
            const base = isBinary ? 1024 : 1000;
            const bytes = Math.round(value * Math.pow(base, exp));
            return { value, unit: normalizedUnit, bytes };
        };

        const sizeParsed = parseSize(element.size);
        const dateParsed = parseDate(element.date);

        rakun_parsed_info.push(cleanObject({
            filename: element.title || undefined,
            name: parsed.name || undefined,
            hash: parsed.hash || undefined,
            format: parsed.extension || undefined,
            quality: parsed.resolution || undefined,
            source: parsed.source || undefined,
            codecs: parsed.codecs || undefined,
            audio: parsed.audio || undefined,
            subtitles: parsed.subtitles || undefined,
            subber: parsed.subber || undefined,
            website: parsed.website || undefined,
            producer: parsed.distributor || undefined,
            meta: parsed.meta || undefined,
            movie: parsed.movie || undefined,
            season: parsed.season || undefined,
            part: parsed.part || undefined,
            episode: parsed.episode || undefined,
            torrent_info: cleanObject({
                date_readable: dateParsed?.readable,
                date_year: dateParsed?.year,
                date_month: dateParsed?.month,
                date_day: dateParsed?.day,
                date_hour: dateParsed?.hour,
                date_minute: dateParsed?.minute,
                date_second: dateParsed?.second,
                date_dayOfWeek: dateParsed?.dayOfWeek,
                date_iso: dateParsed?.iso,
                downloads: element.downloads || undefined,
                leechers: element.leechers || undefined,
                link: element.link || undefined,
                magnet_link: element.magnet || undefined,
                seeders: element.seeders || undefined,
                size: element.size || undefined,
                size_value: sizeParsed?.value,
                size_unit: sizeParsed?.unit,
                size_bytes: sizeParsed?.bytes,
            })
        }));
    });
        
        // console.log(`[format_rakun] Finished parsing ${rakun_parsed_info.length} torrents`);
    return rakun_parsed_info;
    } catch (error) {
        // console.error(`[format_rakun] Error:`, error);
        return [];
    }
}

export async function filterTorrents(animeName, episodeNumber, seasonNumber = 1) {
    const sanitizedAnimeName = sanitize(animeName);
    // console.log(`[filterTorrents] Input - Anime: "${animeName}", Season: ${seasonNumber}, Episode: ${episodeNumber}`);
    // console.log(`[filterTorrents] Sanitized - Anime: "${sanitizedAnimeName}"`);

    try {
        const allTorrents = await format_rakun(sanitizedAnimeName);
        // console.log(`[filterTorrents] Got ${allTorrents.length} torrents from format_rakun`);

        if (!allTorrents || allTorrents.length === 0) {
            // console.warn(`[filterTorrents] No torrents found`);
            return { matches: [], partialMatches: [] };
        }

        const episodeNum = String(parseInt(episodeNumber));
        const seasonNum = String(parseInt(seasonNumber));
        // console.log(`[filterTorrents] LOOKING FOR: Season ${seasonNum}, Episode ${episodeNum}`);
        
        const animeWords = sanitizedAnimeName.split(' ').filter(w => w.length > 2);
        // console.log(`[filterTorrents] Anime words (filtered):`, animeWords);
        
        const partialMatches = [];
        const filtered = allTorrents.filter((torrent, idx) => {
            const torrentFilename = (torrent.filename || '').toLowerCase();
            const torrentName = (torrent.name || '').toLowerCase();
            const torrentEpisode = torrent.episode ? String(parseInt(torrent.episode)) : null;
            const torrentSeason = torrent.season ? String(parseInt(torrent.season)) : '1';
            
            const matchingWordsFilename = animeWords.filter(word => torrentFilename.includes(word));
            const matchingWordsName = animeWords.filter(word => torrentName.includes(word));
            const totalMatching = new Set([...matchingWordsFilename, ...matchingWordsName]);
            
            const nameMatch = totalMatching.size >= Math.max(1, Math.ceil(animeWords.length * 0.4));
            
            const episodeMatch = torrentEpisode === episodeNum;
            const seasonMatch = torrentSeason === seasonNum;

            // Log for debugging
            if (totalMatching.size > 0 || (episodeMatch && seasonMatch)) {
                // console.log(`[filterTorrents] Checking: "${torrent.filename.substring(0, 60)}..."`, {
                //     words: animeWords,
                //     matched: Array.from(totalMatching),
                //     matches: totalMatching.size,
                //     threshold: Math.max(1, Math.ceil(animeWords.length * 0.4)),
                //     season: torrentSeason,
                //     episode: torrentEpisode,
                //     checks: { nameMatch, seasonMatch, episodeMatch }
                // });
            }
            
            if (nameMatch && episodeMatch && !seasonMatch) {
                partialMatches.push({
                    type: 'NAME+EPISODE',
                    torrent: torrent,
                    reason: `Season: got "${torrentSeason}", want "${seasonNum}"`
                });
            } else if (nameMatch && seasonMatch && !episodeMatch) {
                partialMatches.push({
                    type: 'NAME+SEASON',
                    torrent: torrent,
                    reason: `Episode: got "${torrentEpisode}", want "${episodeNum}"`
                });
            }
            
            return nameMatch && seasonMatch && episodeMatch;
        });

        // console.log(`[filterTorrents] ⭐ RESULT: Found ${filtered.length} FULL matches`);
        
        // Fallback 1: if no matches found, try without season filter
        if (filtered.length === 0) {
            // console.log(`[filterTorrents] ⚠️ No matches found! Trying fallback 1: without season filter...`);
            
            const fallbackFiltered = allTorrents.filter((torrent) => {
                const torrentFilename = (torrent.filename || '').toLowerCase();
                const torrentName = (torrent.name || '').toLowerCase();
                const torrentEpisode = torrent.episode ? String(parseInt(torrent.episode)) : null;
                
                const matchingWordsFilename = animeWords.filter(word => torrentFilename.includes(word));
                const matchingWordsName = animeWords.filter(word => torrentName.includes(word));
                const totalMatching = new Set([...matchingWordsFilename, ...matchingWordsName]);
                
                const nameMatch = totalMatching.size >= Math.max(1, Math.ceil(animeWords.length * 0.4));
                const episodeMatch = torrentEpisode === episodeNum;
                
                return nameMatch && episodeMatch;
            });
            
            // console.log(`[filterTorrents] 🔄 Fallback 1 found ${fallbackFiltered.length} matches without season filter`);
            
            if (fallbackFiltered.length > 0) {
                return { matches: fallbackFiltered, partialMatches };
            }
        }

        // Fallback 2: if still no matches, try without episode filter (for movies)
        if (filtered.length === 0) {
            // console.log(`[filterTorrents] ⚠️ Still no matches! Trying fallback 2: without episode filter (movies)...`);
            
            const fallbackFiltered2 = allTorrents.filter((torrent) => {
                const torrentFilename = (torrent.filename || '').toLowerCase();
                const torrentName = (torrent.name || '').toLowerCase();
                const torrentSeason = torrent.season ? String(parseInt(torrent.season)) : '1';
                
                const matchingWordsFilename = animeWords.filter(word => torrentFilename.includes(word));
                const matchingWordsName = animeWords.filter(word => torrentName.includes(word));
                const totalMatching = new Set([...matchingWordsFilename, ...matchingWordsName]);
                
                const nameMatch = totalMatching.size >= Math.max(1, Math.ceil(animeWords.length * 0.4));
                const seasonMatch = torrentSeason === seasonNum;
                
                return nameMatch && seasonMatch;
            });
            
            // console.log(`[filterTorrents] 🔄 Fallback 2 found ${fallbackFiltered2.length} matches without episode filter`);
            
            if (fallbackFiltered2.length > 0) {
                return { matches: fallbackFiltered2, partialMatches };
            }
        }

        // Fallback 3: name match only (for movies without season/episode)
        if (filtered.length === 0) {
            // console.log(`[filterTorrents] ⚠️ Fallback 3: name match only (movies)...`);
            
            const fallbackFiltered3 = allTorrents.filter((torrent) => {
                const torrentFilename = (torrent.filename || '').toLowerCase();
                const torrentName = (torrent.name || '').toLowerCase();
                
                const matchingWordsFilename = animeWords.filter(word => torrentFilename.includes(word));
                const matchingWordsName = animeWords.filter(word => torrentName.includes(word));
                const totalMatching = new Set([...matchingWordsFilename, ...matchingWordsName]);
                
                const nameMatch = totalMatching.size >= Math.max(1, Math.ceil(animeWords.length * 0.4));
                
                return nameMatch;
            });
            
            // console.log(`[filterTorrents] 🔄 Fallback 3 found ${fallbackFiltered3.length} matches (name only)`);
            if (fallbackFiltered3.length > 0) {
                return { matches: fallbackFiltered3, partialMatches };
            }
        }

        return { matches: filtered, partialMatches };
    } catch (error) {
        // console.error(`[filterTorrents] ❌ Error:`, error);
        return { matches: [], partialMatches: [] };
    }
}

/* let test = async () => {
    let result = await format_rakun("ghost in the shell");
    console.log(result);
};
test(); */