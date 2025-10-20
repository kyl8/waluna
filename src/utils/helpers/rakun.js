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

export async function format_rakun(name) {
    let rakun_parsed_info = []
    const info = await parse_nyaa(name)
    info.results.forEach(element => {
        const parsed = rakun.parse(element.title || nam);
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
    return rakun_parsed_info;
}


/* let test = async () => {
    let result = await format_rakun("ghost in the shell");
    console.log(result);
};
test(); */