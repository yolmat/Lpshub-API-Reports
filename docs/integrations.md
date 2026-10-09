# Integrações

## 1. Objetivo

Este documento descreve as integrações externas utilizadas pela API.

A principal origem de informações da aplicação é o ambiente SAP.

---

# 2. SAP

A API deverá disponibilizar informações provenientes do SAP para seus consumidores.

A implementação da integração deve ser isolada das camadas HTTP.

O controller não deve conhecer:

- URL do SAP;
- autenticação do SAP;
- tokens;
- headers específicos;
- formato interno das respostas;
- paginação específica;
- detalhes de comunicação.

Esses detalhes devem permanecer na camada responsável pela integração.

---

# 3. Fluxo

O fluxo esperado é:

```text
Cliente
   ↓
Route
   ↓
Controller
   ↓
Service
   ↓
Integração SAP
   ↓
SAP
```

O Service é responsável por orquestrar a operação.

---

# 4. Credenciais

A configuração do SAP Business One Service Layer é centralizada em `src/config/env.js` e disponibilizada como `sapServiceLayerConfig`. Os valores são obtidos pelas seguintes variáveis:

- `SAP_SERVICE_LAYER_URL`;
- `SAP_SERVICE_LAYER_COMPANY_DB`;
- `SAP_SERVICE_LAYER_USERNAME`;
- `SAP_SERVICE_LAYER_PASSWORD`.

As credenciais reais permanecem exclusivamente no arquivo `.env`, que não é versionado.

Credenciais de sistemas externos devem utilizar variáveis de ambiente.

Nunca armazenar:

- usuário;
- senha;
- token;
- secret;
- API key;

diretamente no código.

---

# 5. Erros de Integração

Falhas externas devem ser tratadas de forma previsível.

Possíveis situações:

- timeout;
- indisponibilidade;
- erro de autenticação;
- erro de autorização;
- resposta inválida;
- recurso inexistente;
- erro HTTP;
- falha de conexão.

A API deve evitar expor detalhes internos do serviço externo ao consumidor.

---

# 5.1 Service Layer SAP Business One

A integração usa os endpoints `POST /b1s/v1/Login` e `POST /b1s/v1/Logout` para cada operação. A sessão retornada pelo login é enviada no header `Cookie` durante as consultas e no logout.

A consulta de filiais usa `GET /b1s/v1/SQLQueries('LpsHub-GetDadosFiliais')/List`. Os registros são obtidos do campo `value` da resposta do SAP.

As chamadas usam o timeout configurado por `SAP_SERVICE_LAYER_TIMEOUT_MS`; quando a variável não for informada, o timeout é de 30 segundos.

O cliente de integração é responsável por verificar respostas HTTP, limitar a comunicação ao host configurado do SAP e transformar falhas externas em erros previsíveis para a API.

---

# 5.2 Extratos bancários

A consulta de extratos bancários usa `GET /b1s/v1/BankPages` com o filtro OData construído pela API a partir de `empresa` e do filtro de datas. Cada item do array `empresa` gera uma condição `endswith(AccountName, ...)`, e as condições são unidas com `or`. O período formado por `dataInicial` e `dataFinal` filtra `DueDate` de forma inclusiva. Alternativamente, o array `datas` cria uma condição `DueDate eq` para cada data, unida por `or`.

Os valores recebidos do cliente são validados antes da chamada externa. As datas devem estar no formato `AAAA-MM-DD`; caracteres de aspas nas empresas são escapados para o formato OData.

---

# 6. Timeouts

Chamadas externas devem possuir timeout configurado.

Uma API não deve permanecer aguardando indefinidamente uma resposta externa.

---

# 7. Logs

Falhas de integração devem possuir informações suficientes para diagnóstico.

Não registrar credenciais ou tokens.

Erros cujo código comece com `SAP_` são registrados com `errorSource: "sap"`. O log contém o `requestId`, o endpoint, o status e o erro sanitizado, sem headers, cookies, credenciais ou payload completo do SAP.

## 7.1 Proteção de credenciais do Service Layer

Credenciais, sessões e tokens do SAP permanecem dentro da integração. Antes de dados recebidos do SAP retornarem aos services, campos sensíveis conhecidos, como senha, usuário, token, sessão, cookie e dados de autorização, são removidos recursivamente. Esses valores nunca devem integrar a resposta HTTP ao frontend.

---

# 8. Dados

Ao receber dados externos:

1. validar a resposta;
2. verificar estrutura esperada;
3. tratar campos ausentes;
4. tratar erros;
5. transformar os dados quando necessário;
6. retornar somente os dados definidos pelo contrato da API.

---

# 9. Paginação

Caso o SAP utilize paginação, a implementação deve encapsular esse comportamento.

O consumidor da API não deve precisar conhecer necessariamente a estratégia de paginação interna utilizada pelo SAP.

Para a consulta de filiais, o campo `odata.nextLink` é seguido internamente até não ser mais retornado. Os itens de todas as páginas são reunidos em uma única resposta da API.

---

# 10. Evolução

Qualquer alteração na estratégia de integração deve ser isolada sempre que possível.

Uma alteração na forma de comunicação com o SAP não deve exigir alterações desnecessárias em:

- controllers;
- routes;
- autenticação;
- consumidores da API.

---

# 11. Informações a Definir

Conforme a integração for implementada, documentar:

- tecnologia utilizada para comunicação com SAP;
- URL base;
- autenticação;
- endpoints;
- entidades consultadas;
- filtros;
- paginação;
- timeout;
- retry;
- tratamento de erros;
- transformação dos dados;
- cache;
- frequência de atualização;
- estratégia de sincronização, quando aplicável.
