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

A rota autenticada `GET /api/v1/service-layer` verifica a disponibilidade do Service Layer usando somente `POST /b1s/v1/Login` e `POST /b1s/v1/Logout`. Ela não consulta nem expõe dados do SAP; o logout é executado em `finally` após uma sessão criada com sucesso.

As chamadas usam o timeout configurado por `SAP_SERVICE_LAYER_TIMEOUT_MS`; quando a variável estiver ausente ou não produzir um inteiro positivo no parser, o fallback implementado em `src/config/env.js` é de 1800000 ms (30 minutos). Esse limite se aplica a cada chamada, incluindo login, páginas e logout. A FBL5N também possui limite total de 30 minutos, com dez segundos reservados para logout. O valor de `.env.example` define o mesmo limite.

O cliente de integração é responsável por verificar respostas HTTP, limitar a comunicação ao host configurado do SAP e transformar falhas externas em erros previsíveis para a API.

---

# 5.2 Extratos bancários

A consulta de extratos bancários usa `GET /b1s/v1/BankPages` com o filtro OData construído pela API a partir de `empresa` e do filtro de datas. Cada item do array `empresa` gera uma condição `endswith(AccountName, ...)`, e as condições são unidas com `or`. O período formado por `dataInicial` e `dataFinal` filtra `DueDate` de forma inclusiva. Alternativamente, o array `datas` cria uma condição `DueDate eq` para cada data, unida por `or`.

Os valores recebidos do cliente são validados antes da chamada externa. As datas devem estar no formato `AAAA-MM-DD`; caracteres de aspas nas empresas são escapados para o formato OData.

## 5.3 Relatório FBL5N

O SQL funcional original está em `docs/implementation/FBL5N.sql`. O comando `npm run fbl5n:sqlqueries` gera os sete textos SQL e um manifesto para cadastro no SAP em `docs/implementation/sqlqueries/`. A API espera que os códigos `FBL5N_LC`, `FBL5N_NS`, `FBL5N_CR`, `FBL5N_RI`, `FBL5N_AD`, `FBL5N_JU_LCM` e `FBL5N_DS_LCM` estejam cadastrados no Service Layer com filtro de cliente. Para consultas sem cliente, também utiliza os sete códigos correspondentes com sufixo `_BASE`, que preservam os textos anteriores sem predicado de cliente. A aplicação não cria nem altera essas consultas durante uma requisição.

A operação abre uma sessão SAP, executa as sete SQLQueries por `POST /SQLQueries('<código>')/List` com `ParamList`, segue `odata.nextLink` e encerra a sessão em `finally`. Os lotes de filtros são executados em sequência; dentro de cada lote, as sete SQLQueries podem executar simultaneamente. O teto técnico de concorrência por requisição FBL5N é dez, com preferência por páginas de 1000 linhas. Os logs operacionais registram início, falha e duração do login, das consultas e de cada página, além do logout. A consolidação registra separadamente o tempo de projeção, validação dos filtros e ordenação, sem registrar filtros financeiros completos ou linhas do relatório.

Os filtros opcionais de filial (`BPLId`), lançamento (`RefDate`), vencimento (`DueDate`) e cliente (`CardCode` ou faixa `clienteInicial`/`clienteFinal`) são enviados ao SAP em `ParamList`. As seis condições de filial e datas já existentes nas SQLQueries recebem limites inclusivos. Valores consecutivos de filial ou data são agrupados em uma faixa; valores isolados formam partições com limites iguais. A integração executa sete SQLQueries por partição e reúne os resultados, preservando duplicatas do SQL original. Uma lista `CardCode` é deduplicada e dividida em lotes de até 25 códigos, vinculados individualmente em `IN (:c0, ..., :c24)` nas sete consultas. As posições não usadas repetem um código do próprio lote; `IN` não multiplica linhas por isso. A faixa de cliente continua usando comparações inclusivas `>= :clienteInicial` e `<= :clienteFinal` e prevalece sobre `CardCode`. Sem cliente, a integração usa as consultas `_BASE`, sem predicado adicional; `LIKE '%'` na versão filtrada anterior fez o SAP encerrar a conexão mesmo em uma consulta de um dia. Faixas de datas preservam a precedência sobre os arrays correspondentes. Nenhum filtro é obrigatório. Mil clientes distintos sem outras partições geram 40 lotes e 280 chamadas iniciais ao SAP, além de paginação; filtros de filial/data podem multiplicar essa quantidade.

As SQLQueries filtradas ainda não têm ordenação estável no SAP. Quando um bloco ultrapassa a página de 1000 linhas, chamadas com a mesma entrada podem apresentar diferenças na composição das páginas, mesmo mantendo a contagem total. A paginação continua sendo seguida até o fim, mas a equivalência exata de consultas volumosas permanece pendente de uma estratégia de ordenação ou paginação estável no Service Layer.

O arquivo `FBL5N_7_SQLQueries_ServiceLayer.json` é a referência local das consultas originais usadas no SAP. `npm run fbl5n:sqlqueries` gera `FBL5N_7_SQLQueries_ServiceLayer_filtradas.json` com o filtro de cliente em lotes. Em 22/10/2026, as sete consultas cadastradas foram atualizadas e relidas no Service Layer com `IN` para 25 clientes e comparação por faixa. As definições possuem seis parâmetros de filial/datas, dois de faixa e 25 posições de cliente; a lista de nomes ocupa 197 caracteres. Sete consultas temporárias retornaram exatamente as mesmas 105 linhas do teste anterior para 25 clientes, preservando a multiplicidade. A rota também coincidiu para 26 clientes em dois lotes. As sete consultas `_BASE` permaneceram para o caminho sem cliente.

As SQLQueries cadastradas também podem devolver campos intermediários (`BPLId`, `RefDate`, `DebitRaw`, `CreditRaw`) em vez das colunas finais do relatório. O service projeta esses campos para as 30 colunas do SQL original e verifica se o SAP respeitou os filtros; não elimina registros na API. Um formato sem os campos essenciais ou um registro fora dos filtros gera `SAP_RESPONSE_ERROR`.

---

# 6. Timeouts

Chamadas externas devem possuir timeout configurado.

Uma API não deve permanecer aguardando indefinidamente uma resposta externa.

---

# 7. Logs

Falhas de integração devem possuir informações suficientes para diagnóstico.

Não registrar credenciais ou tokens.

Erros cujo código comece com `SAP_` são registrados com `errorSource: "sap"`. O log contém o `requestId`, o endpoint, o status e o erro sanitizado, sem headers, cookies, credenciais ou payload completo do SAP.

Consultas de extrato geram auditoria com `REPORT_EXECUTED`, ação `BANK_STATEMENT_SEARCH` e sistema `SAP_B1`. O metadata guarda somente quantidades de empresas e datas ou os limites do período. A quantidade de registros retornados fica em `responseCount`; o conteúdo financeiro não é duplicado.

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
