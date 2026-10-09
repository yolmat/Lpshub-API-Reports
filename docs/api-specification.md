# Especificação da API

## 1. Objetivo

Este documento define o contrato HTTP da API.

A documentação deve evoluir junto com os endpoints implementados.

---

# 2. Base URL

A URL base depende do ambiente.

Exemplo:

```text
http://localhost:3000/api/v1
```

Produção deverá utilizar a URL definida na configuração do ambiente.

Em produção, a API responde `403 HTTPS_REQUIRED` para requisições que não utilizem HTTPS.

---

# 3. Versionamento

Os endpoints devem utilizar versionamento.

Formato:

```text
/api/v1
```

Exemplo:

```text
GET /api/v1/customers
```

---

# 4. HTTP Methods

Utilizar os métodos HTTP de acordo com a finalidade:

```text
GET
POST
PUT
PATCH
DELETE
```

Para APIs predominantemente voltadas à consulta de dados, `GET` deve ser utilizado para operações de leitura.

---

# 5. Status Codes

Utilizar códigos HTTP apropriados.

### 200

Operação executada com sucesso.

### 201

Recurso criado com sucesso.

### 204

Operação executada com sucesso sem conteúdo de resposta.

### 400

Requisição inválida.

### 401

Usuário não autenticado ou credenciais inválidas.

### 403

Usuário autenticado, mas sem permissão.

### 404

Recurso não encontrado.

### 409

Conflito de estado ou recurso.

### 422

Dados semanticamente inválidos.

### 500

Erro interno inesperado.

### 502

Falha na comunicação com serviço externo quando aplicável.

### 503

Serviço temporariamente indisponível.

---

# 6. Respostas

As respostas devem possuir estrutura consistente.

Exemplo de sucesso:

```json
{
    "success": true,
    "data": {}
}
```

Exemplo de erro:

```json
{
    "success": false,
    "error": {
        "code": "RESOURCE_NOT_FOUND",
        "message": "Recurso não encontrado."
    }
}
```

A estrutura definitiva deve ser mantida consistente em toda a API.

Todas as respostas incluem o header `X-Request-ID`, contendo o UUID gerado pela API para correlação entre cliente, logs operacionais e auditoria. O cliente não define esse identificador.

A API não armazena bodies completos na auditoria. Para relatórios, são registrados somente a ação semântica, contagens dos filtros, quantidade de registros retornados, tamanho da resposta, duração, resultado e sistema de destino.

## Ações de auditoria por rota

| Método | Rota | AuditAction |
| --- | --- | --- |
| `GET` | `/api` | `API_STATUS_CHECK` |
| `GET` | `/health` | `HEALTH_CHECK` |
| `POST` | `/api/v1/auth/login` | `AUTHENTICATE` |
| `GET` | `/api/v1/auth/me` | `VIEW_CURRENT_USER` |
| `GET` | `/api/v1/auth/users` | `LIST_USERS` |
| `POST` | `/api/v1/auth/logout` | `LOGOUT` |
| `POST` | `/api/v1/auth/register` | `CREATE_USER` |
| `POST` | `/api/v1/auth/password-reset` | `RESET_USER_PASSWORD` |
| `POST` | `/api/v1/auth/deactivate` | `DISABLE_USER` |
| `POST` | `/api/v1/extratos-bancarios` | `BANK_STATEMENT_SEARCH` |
| `GET` | `/api/v1/filiais` | `BRANCH_LIST` |
| `GET` | `/api/v1/service-layer` | `CHECK_SERVICE_LAYER_CONNECTION` |

O middleware de auditoria é global e executa antes de HTTPS, rate limit, validação, autenticação e controllers. Portanto, todas as respostas dessas rotas, inclusive falhas antecipadas, produzem auditoria.

Com exceção de `POST /api/v1/auth/login` e `GET /api`, todas as rotas exigem o cookie `lpshub_access_token` e executam o middleware `authenticate` após a validação da requisição.

---

# 7. Paginação

Endpoints que retornam grandes volumes devem utilizar paginação.

Exemplo conceitual:

```text
GET /api/v1/customers?page=1&limit=50
```

Resposta:

```json
{
    "success": true,
    "data": [],
    "pagination": {
        "page": 1,
        "limit": 50,
        "total": 1000,
        "totalPages": 20
    }
}
```

---

# 8. Filtros

Filtros devem ser recebidos através de query parameters quando fizerem parte de consultas GET.

Exemplo:

```text
GET /api/v1/sales?companyId=1&startDate=2026-01-01&endDate=2026-01-31
```

Os parâmetros devem ser validados antes de chegar à lógica de negócio.

---

# 9. Autenticação

Endpoints protegidos recebem o JWT pelo cookie `lpshub_access_token`, emitido no login e associado a uma sessão no PostgreSQL. O middleware atual não utiliza `Authorization: Bearer` para autenticar. O token não deve ser colocado em query parameters nem retornado em JSON.

## CORS

Origens de frontend devem ser cadastradas em `CORS_ALLOWED_ORIGINS`. A API não utiliza `*` e não envia cabeçalhos CORS a origens não cadastradas, inclusive quando a autenticação por cookie estiver habilitada.

Quando a autenticação por cookie for utilizada, o token será armazenado somente no cookie `lpshub_access_token`, marcado como `HttpOnly`, `SameSite=Strict` e `Path=/`; em produção, também como `Secure`. O token não deve ser incluído em respostas JSON.

O JWT referencia uma sessão mantida no servidor. Cada requisição autenticada e validada renova sua atividade. Após duas horas sem atividade ou oito horas desde a criação da sessão, ela é invalidada e a API responde `401 UNAUTHENTICATED`.

## 9.1 Autenticação

### POST /api/v1/auth/login

Recebe `login` e `senha`. Em caso de sucesso, a API responde os dados públicos do usuário e define o cookie de autenticação.

### GET /api/v1/auth/me

Exige cookie de autenticação válido. Retorna o `id`, o `login` e o `email` do usuário ao qual a sessão pertence. Cookie ausente ou header sem o nome esperado retorna `400 INVALID_REQUEST` na validação Zod. Cookie com nome correto, mas token inválido ou expirado, sessão removida ou usuário inativo retorna `401 UNAUTHENTICATED` ao passar pelo middleware de autenticação.

### POST /api/v1/auth/logout

Exige somente o cookie de autenticação. A API identifica a sessão pelo cookie, exclui somente essa `UserSession`, remove o cookie do navegador e responde `200` com `{ "success": true }`.

### POST /api/v1/auth/deactivate

Exige cookie de um usuário `ADM` e recebe `login`. A API desativa o usuário, exclui todas as sessões vinculadas e responde os dados públicos da conta com `status: false`.

### POST /api/v1/auth/register

Exige cookie de um usuário `ADM`. Recebe `login`, `email` e `senha`; cria um usuário ativo com papel `USER`. A resposta não contém senha, hash ou token.

### GET /api/v1/auth/users

Exige cookie de um usuário `ADM`. Retorna todos os usuários ordenados por login, com `id`, `login`, `email`, `status`, `role`, `createdAt` e `updatedAt`. A resposta nunca inclui `passwordHash`, sessões ou identificadores de sessão.

### POST /api/v1/auth/password-reset

Exige cookie de um usuário `ADM`. Recebe `login` e `email`, localiza o usuário e aplica a senha padrão configurada no ambiente. A resposta não contém senha, hash ou token.

---

# 10. Documentação de Endpoints

Cada endpoint implementado deve possuir documentação contendo:

- método;
- URL;
- autenticação;
- parâmetros;
- body;
- resposta;
- status codes;
- erros possíveis;
- regras de negócio relevantes.

Exemplo:

```text
GET /api/v1/customers
```

### Autenticação

Obrigatória.

### Query Parameters

```text
page
limit
search
```

### Response

```json
{
    "success": true,
    "data": []
}
```

---

# 11. Compatibilidade

Alterações em endpoints existentes devem considerar compatibilidade com consumidores atuais.

Não remover ou alterar silenciosamente campos utilizados por clientes existentes.

Mudanças incompatíveis devem ser avaliadas como possível alteração de versão da API.

---

# 12. Extratos bancários

## POST /api/v1/extratos-bancarios

Retorna os lançamentos bancários do SAP filtrados por conta e período.

### Autenticação

Obrigatória. Envie o cookie de autenticação `lpshub_access_token` emitido no login.

### Request body

| Campo | Obrigatório | Formato | Exemplo |
| --- | --- | --- | --- |
| `empresa` | Sim | Array de textos | `["LPSI", "LSUL", "EBC"]` |
| `dataInicial` | Condicional | `AAAA-MM-DD` | `2025-06-01` |
| `dataFinal` | Condicional | `AAAA-MM-DD` | `2025-06-30` |
| `datas` | Condicional | Array de datas `AAAA-MM-DD` | `["2026-04-01", "2026-04-02"]` |

Exemplo de body:

```json
{
    "empresa": ["LPSI", "LSUL", "EBC"],
    "dataInicial": "2025-06-01",
    "dataFinal": "2025-06-30"
}
```

A API cria um filtro `endswith(AccountName, ...)` para cada empresa e os une com `or`. Informe `dataInicial` e `dataFinal` para filtrar um período inclusivo em `DueDate`, ou `datas` para consultar datas específicas; neste caso, a API cria uma condição `DueDate eq` para cada data e as une com `or`. Todas as páginas retornadas por `odata.nextLink` são reunidas internamente.

### Resposta de sucesso

Status: `200`

```json
{
    "success": true,
    "data": []
}
```

### Validação das requisições

Todos os bodies, queries e params são validados antes do controller. Campos não
documentados são rejeitados. Quando houver erro de validação, a API responde
`400 INVALID_REQUEST` neste formato, sem retornar valores sensíveis enviados:

```json
{
    "success": false,
    "error": {
        "code": "INVALID_REQUEST",
        "message": "Dados da requisição inválidos.",
        "details": [
            {
                "location": "body",
                "path": "email",
                "code": "invalid_format",
                "message": "O campo EMAIL deve conter um e-mail válido."
            }
        ]
    }
}
```

Todas as rotas possuem limite global de 50 requisições por minuto por IP. Login
e cadastro possuem limite adicional de 15 requisições por minuto cada um; a
redefinição de senha possui limite adicional de 5. Ao exceder um limite, a API
responde `429 RATE_LIMIT_EXCEEDED`.

### Erros possíveis

- `400 INVALID_REQUEST`: body, query, params ou headers inválidos;
- erros de integração com o SAP, conforme definidos para a rota de filiais.

`empresa` deve conter ao menos uma filial válida. Informe `datas` com uma ou mais
datas válidas ou informe o intervalo completo em `dataInicial` e `dataFinal`, com
data final maior ou igual à inicial.

---

# 13. Filiais

## GET /api/v1/filiais

Retorna todas as filiais consultadas no SAP Business One Service Layer.

### Autenticação

Obrigatória. Envie o cookie de autenticação `lpshub_access_token` emitido no login.

### Query Parameters

Nenhum.

### Resposta de sucesso

Status: `200`

```json
{
    "success": true,
    "data": [
        {
            "IDSAP": 1,
            "Nome Empresa": "ITAPLAN BRASIL CONSULTORIA DE IMOVEIS LTDA",
            "Sigla": "LITA"
        }
    ]
}
```

A API reúne automaticamente os itens de todas as páginas indicadas por `odata.nextLink` pelo SAP.

### Erros possíveis

- `500 SAP_CONFIGURATION_ERROR`: configuração do SAP incompleta;
- `502 SAP_CONNECTION_ERROR`, `SAP_TIMEOUT` ou `SAP_REQUEST_ERROR`: falha de comunicação com o SAP;
- `502 SAP_RESPONSE_ERROR` ou `SAP_PAGINATION_ERROR`: resposta ou paginação inválida do SAP.

---

# 14. Verificação do Service Layer

## GET /api/v1/service-layer

Verifica se o SAP Business One Service Layer está acessível com as credenciais configuradas. A operação abre e encerra uma sessão SAP, sem consultar ou retornar dados do SAP.

### Autenticação

Obrigatória. Envie o cookie de autenticação `lpshub_access_token` emitido no login.

### Resposta de sucesso

Status: `200`

```json
{
    "message": "Service Layer funcionando"
}
```

### Erros possíveis

- `500 SAP_CONFIGURATION_ERROR`: configuração do SAP incompleta;
- `502 SAP_CONNECTION_ERROR`, `SAP_TIMEOUT` ou `SAP_REQUEST_ERROR`: falha de comunicação, autenticação ou encerramento de sessão no SAP.
