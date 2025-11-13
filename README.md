# 🌙 Waluna

Waluna é um projeto em Rust e Javascript (React e ChakraUI) que visa democratizar o acesso à 7ª arte de forma simples e sem enrolação. Suas funções são consistidas em:

- API HTTP de um client bittorrent com download e monitoramento.
- Conversão em tempo real do video via HLS.
- Front-end rápido e intuitivo, com player embutido que lê as playlists geradas via HLS e roda o vídeo enquanto ele é baixado.

---

## Future Updates

SISTEMA DE PLUGIN
- Um sistema baseado em webscraping utilizando a linguagem de programação lua como primária. O código deverá ser um arquivo .lua simples (sitedefilmes.lua) que retorna um json com links de playlists m3u8, vídeos ou o diretório local dos vídeos cacheados e baixados associados com um id único gerado pela pesquisa do usuário.
	Exemplo de retorno:
	```json
	{
	"id":"1700000000-123456",
	"query":"vingadores 2012",
	"timestamp":"2025-10-13T02:30:00Z",
	"success":true,
	"results":[
		{"type":"m3u8","url":"https://cdn.example.com/stream/vingadores/master.m3u8"},
		{"type":"video","url":"https://media.example.com/videos/vingadores.mp4"}
	],
	"cache_dir":"cache/1700000000-123456"
	}
	```
  
MELHORIAS NO FRONT
- Sistema de temas: Darkmode, Lightmode, Ultradark, etc.
- Adicionar perfil e opções de perfil.
- Histórico.
- Assistindo, Planejando assistir, Acompanhando.
---

# Documentação da API - Waluna 

## Visão Geral

A API Waluna é uma aplicação Rust construída com Axum que fornece funcionalidades de:
 - Busca de torrents em nyaa.si
 - Download de torrents via magnet links
 - Conversão de vídeos para HLS (HTTP Live Streaming)
 - Gerenciamento de downloads
 - Serving de playlists e segmentos HLS

**URL Base**: `http://127.0.0.1:8080`

**Versão**: 0.1.0

---

## Endpoints

### 1. Root

#### GET `/`

Verifica se o servidor está rodando.

**Query Parameters**: Nenhum

**Response**:
```
Waluna Backend
```

**Status Code**: 200

---

### 2. Busca de Torrents

#### GET `/search`

Busca animes no tracker nyaa.si com filtros para apenas torrents confiáveis, ordenados por número de seeders.

**Query Parameters**:

| Parâmetro | Tipo    | Obrigatório | Descrição | Exemplo |
|-----------|---------|-------------|-----------|---------|
| `q`       | string  | Não         | Termo de busca | `q=One+Piece` |
| `pretty`  | boolean | Não         | Formatação JSON legível (1 ou true) | `pretty=1` |

**Defaults**: 
- `q`: "Ousama Ranking"
- `pretty`: false

**Response** (200 OK):
```json
{
	"ok": true,
	"query": "One Piece",
	"results": [
		{
			"title": "One Piece - Episode 1",
			"link": "https://nyaa.si/view/12345",
			"magnet": "magnet:?xt=urn:btih:...",
			"size": "500 MB",
			"seeders": 150,
			"leechers": 25,
			"downloads": 5000,
			"date": "2024-10-20"
		}
	],
	"count": 5
}
```

**Response** (500 Internal Server Error):
```json
{
	"ok": false,
	"error": "Descrição do erro"
}
```

**Exemplo de Uso**:
```bash
curl "http://127.0.0.1:8080/search?q=One+Piece&pretty=1"
```

---

### 3. Download de Torrent

#### GET `/start`

Inicia o download de um torrent através de um magnet link.

**Query Parameters**:

| Parâmetro | Tipo   | Obrigatório | Descrição |
|-----------|--------|-------------|-----------|
| `q`       | string | ✓ Sim       | Magnet link (URL-encoded ou não) |

**Response** (200 OK):
```json
{
	"ok": true,
	"download_id": "abc123def456",
	"magnet": "magnet:?xt=urn:btih:...",
	"message": "Download started successfully"
}
```

**Response** (400 Bad Request):
```json
{
	"ok": false,
	"error": "Query parameter 'q' is required"
}
```

**Response** (500 Internal Server Error):
```json
{
	"ok": false,
	"error": "Failed to start download: descrição do erro"
}
```

**Exemplo de Uso**:
```bash
# Com magnet link direto
curl "http://127.0.0.1:8080/start?q=magnet:?xt=urn:btih:abc123"

# Com magnet link URL-encoded
curl "http://127.0.0.1:8080/start?q=magnet%3A%3Fxt%3Durn%3Abtih%3Aabc123"
```

---

### 4. Encode Magnet Link

#### GET `/encode`

Codifica (URL-encode) um magnet link para ser usado em URLs.

**Query Parameters**:

| Parâmetro | Tipo   | Obrigatório | Descrição |
|-----------|--------|-------------|-----------|
| `q`       | string | ✓ Sim       | Magnet link não-codificado |

**Response** (200 OK):
```json
{
	"ok": true,
	"original": "magnet:?xt=urn:btih:abc123",
	"encoded": "magnet%3A%3Fxt%3Durn%3Abtih%3Aabc123",
	"url": "http://127.0.0.1:8080/start?q=magnet%3A%3Fxt%3Durn%3Abtih%3Aabc123",
	"message": "Magnet link encoded successfully"
}
```

**Exemplo de Uso**:
```bash
curl "http://127.0.0.1:8080/encode?q=magnet:?xt=urn:btih:abc123"
```

---

### 5. Decode Magnet Link

#### GET `/decode`

Decodifica um magnet link URL-encoded para seu formato original.

**Query Parameters**:

| Parâmetro | Tipo   | Obrigatório | Descrição |
|-----------|--------|-------------|-----------|
| `encoded` | string | ✓ Sim       | Magnet link URL-encoded |

**Response** (200 OK):
```json
{
	"ok": true,
	"encoded": "magnet%3A%3Fxt%3Durn%3Abtih%3Aabc123",
	"decoded": "magnet:?xt=urn:btih:abc123",
	"message": "Magnet link decoded successfully"
}
```

**Exemplo de Uso**:
```bash
curl "http://127.0.0.1:8080/decode?encoded=magnet%3A%3Fxt%3Durn%3Abtih%3Aabc123"
```

---

### 6. Status do Download

#### GET `/status`

Obtém o status detalhado de um download específico.

**Query Parameters**:

| Parâmetro | Tipo   | Obrigatório | Descrição |
|-----------|--------|-------------|-----------|
| `id`      | string | ✓ Sim       | ID do download |
| `pretty`  | boolean | Não         | Formatação JSON legível (1 ou true) |

**Response** (200 OK):
```json
{
	"ok": true,
	"download_id": "abc123def456",
	"progress": 45.5,
	"downloaded": "450 MB",
	"total": "1000 MB",
	"status": "downloading",
	"download_speed": "5.2 MB/s",
	"upload_speed": "0.5 MB/s",
	"eta": "120s",
	"name": "One Piece - Episode 1 [1080p]",
	"message": "Status retrieved successfully"
}
```

**Response** (400 Bad Request):
```json
{
	"ok": false,
	"error": "Query parameter 'id' is required"
}
```

**Response** (500 Internal Server Error):
```json
{
	"ok": false,
	"error": "Failed to get status: descrição do erro"
}
```

**Exemplo de Uso**:
```bash
curl "http://127.0.0.1:8080/status?id=abc123def456&pretty=1"
```

---

### 7. Progress de Download

#### GET `/progress`

Obtém o progresso de um download específico usando a lista de downloads.

**Query Parameters**:

| Parâmetro | Tipo   | Obrigatório | Descrição |
|-----------|--------|-------------|-----------|
| `id`      | string | ✓ Sim       | ID do download |
| `pretty`  | boolean | Não         | Formatação JSON legível (1 ou true) |

**Response** (200 OK):
```json
{
	"ok": true,
	"download": {
		"download_id": "abc123def456",
		"name": "One Piece - Episode 1",
		"progress": 75.5,
		"downloaded": "755 MB",
		"total": "1000 MB",
		"status": "downloading"
	},
	"message": "Progress retrieved successfully"
}
```

---

## HLS (HTTP Live Streaming) Endpoints

### 10. Playlist M3U8

#### GET `/hls/playlist/:id`

Retorna a playlist M3U8 para um vídeo em HLS, com URLs reescritas como absolutas.

---

### 11. Segmento HLS

#### GET `/hls/segments/:id/:segment`

Retorna um arquivo de segmento (.ts) para um dado id e nome de segmento.

**Response** (200 OK): conteúdo binário do segmento com Content-Type `video/MP2T`.

---

### 12. Iniciar Conversão HLS

#### GET `/hls/convert/:id` (ou `GET /convert/:id` montado sob `/hls`)

Inicia a conversão do arquivo associado ao `id` (procura em `./cache/downloads/` e caminhos alternativos). Se a conversão já existir, retorna status apropriado.

**Response** (200 OK): JSON com `{ ok: true, message: "HLS conversion started", id, status: "processing" }` ou `{ ok: false, error: ... }` em caso de falha.

---

### 13. Status de Segmentos / Informações HLS

#### GET `/hls/status/:id`

Retorna informações sobre os segmentos HLS gerados (lista de segmentos, contagem, playlist URL, duração calculada a partir de segmentos e duração original se conhecida).

Exemplo de resposta:
```json
{
	"id": "1331ee21...",
	"status": "converting",
	"segments_count": 245,
	"segments": ["segment_001.ts", "segment_002.ts"],
	"playlist_url": "http://127.0.0.1:8080/hls/playlist/1331ee21...",
	"segment_duration": 1.0,
	"is_complete": false,
	"total_duration": 245.0,
	"duration": 1302.50
}
```

---

### 14. Conversão - Info / Metadata

#### GET `/hls/info/:id`

Retorna o metadata armazenado em `HLSManager` para o id (input_file, output_dir, status, progress, duration, isStopped).

Exemplo de resposta:
```json
{
	"id":"1331ee21...",
	"input_file":"./cache/downloads/panty.mkv",
	"output_dir":"./cache/hls/1331ee21...",
	"status":"converting",
	"progress": 23.5,
	"duration": 1302.5,
	"isStopped":"no"
}
```

---

### 15. Parar / Retomar / Deletar Cache HLS

#### GET `/hls/stop_conversion/:id`

Envia um sinal de cancelamento para a conversão em andamento (se houver). Resposta inclui `isStopped` indicando estado global.

#### GET `/hls/resume_conversion/:id`

Retoma uma conversão previamente iniciada (usa `input_file` salvo em `HLSManager`). Retorna erro se arquivo de entrada não existir ou se já estiver em execução.

#### GET `/hls/delete/:id`

Remove `./cache/hls/:id`, arquivos correspondentes em `./cache/downloads` e `./cache/subtitles` que contenham o id no nome e remove a entrada em memória do `HLSManager`.

Exemplo de resposta bem-sucedida:
```json
{ "ok": true, "removed": ["hls_dir","download_file:...","manager_entry"], "id": "1331ee21..." }
```

---

## Stream Manager Endpoints

### 16. Listar Streams (Vídeos, Áudio, Legendas)

#### GET `/streams/:id`

Lista todos os streams (vídeo, áudio, legendas, anexos) descobertos em um arquivo de vídeo para um determinado ID de download.

**Path Parameters**:

| Parâmetro | Tipo   | Descrição |
|-----------|--------|-----------|
| `id`      | string | ID do download/vídeo |

**Query Parameters**:

| Parâmetro | Tipo   | Obrigatório | Descrição |
|-----------|--------|-------------|-----------|
| `filter`  | string | Não         | Filtro: `video`, `audio`, `subtitle`, `attachment`, `all` |

**Response** (200 OK):
```json
{
	"ok": true,
	"id": "abc123def456",
	"streams": [
		{
			"index": 0,
			"codec_type": "video",
			"codec_name": "h264",
			"width": 1920,
			"height": 1080,
			"duration": 1302.5
		},
		{
			"index": 1,
			"codec_type": "audio",
			"codec_name": "aac",
			"language": "en",
			"channels": 2
		},
		{
			"index": 2,
			"codec_type": "subtitle",
			"codec_name": "ass",
			"language": "pt"
		}
	]
}
```

**Exemplo de Uso**:
```bash
# Listar todos os streams
curl "http://127.0.0.1:8080/streams/abc123def456"

# Listar apenas legendas
curl "http://127.0.0.1:8080/streams/abc123def456?filter=subtitle"

# Listar apenas áudio
curl "http://127.0.0.1:8080/streams/abc123def456?filter=audio"
```

---

### 17. Extrair Legendas

#### GET `/streams/extract/:id`

Extrai streams de legendas para arquivos e os serve via `/cache/subtitles/:id/`.

**Path Parameters**:

| Parâmetro | Tipo   | Descrição |
|-----------|--------|-----------|
| `id`      | string | ID do download/vídeo |

**Response** (200 OK):
```json
{
	"ok": true,
	"id": "abc123def456",
	"extracted_subtitles": [
		{
			"language": "pt",
			"file": "subtitle_0_pt.ass",
			"url": "http://127.0.0.1:8080/cache/subtitles/abc123def456/subtitle_0_pt.ass"
		},
		{
			"language": "en",
			"file": "subtitle_1_en.ass",
			"url": "http://127.0.0.1:8080/cache/subtitles/abc123def456/subtitle_1_en.ass"
		}
	],
	"message": "Subtitles extracted and served"
}
```

**Response** (404 Not Found):
```json
{
	"ok": false,
	"error": "Video file not found or no subtitles detected"
}
```

**Exemplo de Uso**:
```bash
curl "http://127.0.0.1:8080/streams/extract/abc123def456"
```

---

### 18. Obter Legendas - Todas

#### GET `/streams/subs/:id`

Obtém metadados de todos os streams de legendas disponíveis para um vídeo.

**Path Parameters**:

| Parâmetro | Tipo   | Descrição |
|-----------|--------|-----------|
| `id`      | string | ID do download/vídeo |

**Response** (200 OK):
```json
{
	"ok": true,
	"id": "abc123def456",
	"subtitles": [
		{
			"index": 2,
			"codec_name": "ass",
			"language": "pt",
			"title": "Portuguese"
		},
		{
			"index": 3,
			"codec_name": "ass",
			"language": "en",
			"title": "English"
		}
	],
	"count": 2
}
```

**Exemplo de Uso**:
```bash
curl "http://127.0.0.1:8080/streams/subs/abc123def456"
```

---

### 19. Obter Legendas - Por Idioma

#### GET `/streams/subs/:id/:language`

Obtém metadados de legendas filtradas por código de idioma.

**Path Parameters**:

| Parâmetro | Tipo   | Descrição |
|-----------|--------|-----------|
| `id`      | string | ID do download/vídeo |
| `language`| string | Código de idioma (pt, en, es, ja, etc.) |

**Response** (200 OK):
```json
{
	"ok": true,
	"id": "abc123def456",
	"language": "pt",
	"subtitle": {
		"index": 2,
		"codec_name": "ass",
		"language": "pt",
		"title": "Portuguese"
	}
}
```

**Response** (404 Not Found):
```json
{
	"ok": false,
	"error": "No subtitles found for language: pt"
}
```

**Exemplo de Uso**:
```bash
curl "http://127.0.0.1:8080/streams/subs/abc123def456/pt"
curl "http://127.0.0.1:8080/streams/subs/abc123def456/en"
```

---

## Como rodar o projeto

Pré-requisitos:

- Rust toolchain (recomendado: estável >= 1.70)
- `cargo` (vem com Rust)
- Binários `ffmpeg` e `ffprobe` colocados em `./ffmpeg/bin/` (ou disponíveis em PATH)

Executar localmente:

```powershell
cargo build
cargo run
```

O servidor escuta por padrão em `127.0.0.1:8080`.

Observações:

- Certifique-se de que `ffmpeg/bin/ffmpeg(.exe)` e `ffmpeg/bin/ffprobe(.exe)` existam. O projeto procura por `./ffmpeg/bin/ffmpeg` em relação ao diretório de trabalho.
- O cache HLS é armazenado em `./cache/hls/`, os downloads em `./cache/downloads/` e as legendas em `./cache/subtitles/`.

## Notas de desenvolvimento

- O gerenciador HLS (`src/torrent/hls_manager/mod.rs`) expõe um `HLSManager` na memória (OnceCell + Arc<RwLock<...>>).
- As conversões são rastreadas nas estruturas `HLSConversion` (id, input_file, output_dir, status, progress, duration).
- O cancelamento usa canais `tokio::sync::oneshot` para sinalizar a tarefa de monitoramento do FFmpeg.

## Contribuições

Pull requests são bem-vindas.



