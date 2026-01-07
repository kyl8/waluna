import rakun from "@lowlighter/rakun"

// simple function to format parser output. uses the torrent filename to parse and extract relevant info
// its merged with other torrent info parsed by the backend using rust and nyaa-si library 
// thanks to @lowlighter for the rakun library!
// thanks to @cijiugechu for the nyaa-si library!


// TODO: improve this using some fuzzy matching algorithm to better match anime and torrent names

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
    let rakun_parsed_info = []
    
    try {
        const info = await parse_nyaa(sanitizedName)
        
        info.results.forEach((element, idx) => {
            const parsed = rakun.parse(element.title || name);

        const parseSize = (s) => {
            if (!s) return undefined;
            const str = String(s).trim();
            let unit, value;

            let m = str.replace(/\s+/g, "").match(/^([KMGTPE]?i?B)\(([\d.,]+)\)$/i);
            if (m) {
                unit = m[1].toUpperCase();
                value = parseFloat(m[2].replace(",", "."));
            } else {
                m = str.match(/^([\d.,]+)\s*([KMGTPE]?i?B)$/i);
                if (!m) return undefined;
                value = parseFloat(m[1].replace(",", "."));
                unit = m[2].toUpperCase();
            }

            const isBinary = unit.endsWith("IB");
            const normalizedUnit = isBinary ? unit.replace("IB", "B") : unit;
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
        
    return rakun_parsed_info; 
    } catch (error) {
        // console.error(`[format_rakun] Error:`, error);
        return [];
    }
}

export async function filterTorrents(animeName, episodeNumber, seasonNumber = 1) {
    const sanitizedAnimeName = sanitize(animeName);

    try {
        const allTorrents = await format_rakun(sanitizedAnimeName);

        if (!allTorrents || allTorrents.length === 0) {
            return { matches: [], partialMatches: [] };
        }

        const episodeNum = parseInt(episodeNumber, 10);
        const seasonNum = String(parseInt(seasonNumber, 10));
        
        const animeWords = sanitizedAnimeName.split(' ').filter(w => w.length > 2);
        
        const partialMatches = [];
        const filtered = allTorrents.filter((torrent, idx) => {
            const torrentFilename = (torrent.filename || '').toLowerCase();
            const torrentName = (torrent.name || '').toLowerCase();
            const torrentEpisode = torrent.episode ? parseInt(torrent.episode, 10) : null;
            const torrentSeason = torrent.season ? String(parseInt(torrent.season, 10)) : '1';
            
            const matchingWordsFilename = animeWords.filter(word => torrentFilename.includes(word));
            const matchingWordsName = animeWords.filter(word => torrentName.includes(word));
            const totalMatching = new Set([...matchingWordsFilename, ...matchingWordsName]);
            
            const nameMatch = torrentFilename.includes(sanitizedAnimeName) || torrentName.includes(sanitizedAnimeName) || totalMatching.size >= Math.max(1, Math.floor(animeWords.length * 0.2));
            
            const episodeMatch = torrentEpisode === episodeNum;
            const seasonMatch = torrentSeason === seasonNum;
            
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
                    reason: `Episode: got "${torrentEpisode ?? 'unknown'}", want "${String(episodeNum)}"`
                });
            }
            
            return nameMatch && seasonMatch && episodeMatch;
        });

        if (filtered.length === 0) {
            const fallbackFiltered = allTorrents.filter((torrent) => {
                const torrentFilename = (torrent.filename || '').toLowerCase();
                const torrentName = (torrent.name || '').toLowerCase();
                const torrentEpisode = torrent.episode ? parseInt(torrent.episode, 10) : null;
                
                const matchingWordsFilename = animeWords.filter(word => torrentFilename.includes(word));
                const matchingWordsName = animeWords.filter(word => torrentName.includes(word));
                const totalMatching = new Set([...matchingWordsFilename, ...matchingWordsName]);
                
                const nameMatch = torrentFilename.includes(sanitizedAnimeName) || torrentName.includes(sanitizedAnimeName) || totalMatching.size >= Math.max(1, Math.floor(animeWords.length * 0.2));
                const episodeMatch = torrentEpisode === episodeNum;
                
                return nameMatch && episodeMatch;
            });
            
            if (fallbackFiltered.length > 0) {
                return { matches: fallbackFiltered, partialMatches };
            }
        }

        if (filtered.length === 0) {
            const fallbackFiltered2 = allTorrents.filter((torrent) => {
                const torrentFilename = (torrent.filename || '').toLowerCase();
                const torrentName = (torrent.name || '').toLowerCase();
                const torrentSeason = torrent.season ? String(parseInt(torrent.season, 10)) : '1';
                
                const matchingWordsFilename = animeWords.filter(word => torrentFilename.includes(word));
                const matchingWordsName = animeWords.filter(word => torrentName.includes(word));
                const totalMatching = new Set([...matchingWordsFilename, ...matchingWordsName]);
                
                const nameMatch = torrentFilename.includes(sanitizedAnimeName) || torrentName.includes(sanitizedAnimeName) || totalMatching.size >= Math.max(1, Math.floor(animeWords.length * 0.2));
                const seasonMatch = torrentSeason === seasonNum;
                
                return nameMatch && seasonMatch;
            });
            
            if (fallbackFiltered2.length > 0) {
                return { matches: fallbackFiltered2, partialMatches };
            }
        }

        if (filtered.length === 0) {
            const fallbackFiltered3 = allTorrents.filter((torrent) => {
                const torrentFilename = (torrent.filename || '').toLowerCase();
                const torrentName = (torrent.name || '').toLowerCase();
                
                const matchingWordsFilename = animeWords.filter(word => torrentFilename.includes(word));
                const matchingWordsName = animeWords.filter(word => torrentName.includes(word));
                const totalMatching = new Set([...matchingWordsFilename, ...matchingWordsName]);
                
                const nameMatch = torrentFilename.includes(sanitizedAnimeName) || torrentName.includes(sanitizedAnimeName) || totalMatching.size >= Math.max(1, Math.floor(animeWords.length * 0.2));
                
                return nameMatch;
            });
            
            if (fallbackFiltered3.length > 0) {
                return { matches: fallbackFiltered3, partialMatches };
            }
        }

        return { matches: filtered, partialMatches };
    } catch (error) {
        return { matches: [], partialMatches: [] };
    }
}