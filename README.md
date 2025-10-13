# 🌙 Waluna

Waluna é um projeto em Rust que visa democratizar o acesso à 7 arte de forma simples e sem enrolação. Suas funções são consistidas em:

- API HTTP de um client bittorent com download e monitoramento.
- Conversão em tempo real do video via HLS.
- Front-end rápido e intuitivo, com player embutido que lê as playlists geradas via HLS e roda o vídeo enquanto ele é baixado.

# Future updates
- SISTEMA DE PLUGIN
Um sistema baseado em webscraping utilizando a linguagem de programação lua como primária. O código deverá ser um arquivo .lua simples (sitedefilmes.lua) que retorna um json com links de playlists m3u8, vídeos ou o diretório local dos vídeos cacheados e baixados associados com um id único gerado pela pesquisa do usuário.
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
  ```

