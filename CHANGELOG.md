## Não publicado

- Centralizada a configuração de conexão do SAP Business One Service Layer por variáveis de ambiente.
- Migrado o código da aplicação de CommonJS para ECMAScript Modules.
- Adicionada a rota `GET /api/v1/filiais` com integração paginada ao SAP Business One Service Layer.
- Alterada a rota de extratos bancários para `POST /api/v1/extratos-bancarios`, com filtro de múltiplas empresas recebido no body.
- Adicionado ao endpoint de extratos bancários o filtro opcional `datas` para consulta de datas específicas.
