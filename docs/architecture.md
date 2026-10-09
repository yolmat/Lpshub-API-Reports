# Arquitetura da Aplicação

## 1. Visão Geral

A aplicação é uma API backend responsável por disponibilizar informações provenientes do ambiente SAP para sistemas consumidores.

A arquitetura foi definida para separar claramente:

- transporte HTTP;
- autenticação;
- regras de negócio;
- acesso aos dados;
- integrações externas;
- configurações;
- funções auxiliares.

---

## 2. Fluxo Principal

O fluxo padrão de uma requisição é:

```text
Cliente
   ↓
Route
   ↓
Middleware
   ↓
Controller
   ↓
Service
   ↓
Repository
   ↓
Prisma
   ↓
PostgreSQL
```

Quando houver integração externa:

```text
Cliente
   ↓
Route
   ↓
Middleware
   ↓
Controller
   ↓
Service
   ↓
Integration / Repository
   ↓
SAP
```

---

# 3. Estrutura

```text
src/
├── config/
├── controllers/
├── middlewares/
├── repositories/
├── routes/
├── services/
└── utils/
```

---

# 4. Config

Responsabilidade:

- configurações;
- variáveis de ambiente;
- configuração do banco;
- configuração de autenticação;
- configurações de integrações.

Não deve conter regras de negócio.

---

# 4.1 Módulos JavaScript

O projeto utiliza ECMAScript Modules (ES Modules). Os arquivos devem utilizar `import` e `export`; `require` e `module.exports` não devem ser utilizados.

Importações locais devem declarar explicitamente a extensão `.js`.

---

# 4.2 Segurança HTTP

A configuração HTTP é aplicada na criação da aplicação, antes das rotas. Ela desativa o cabeçalho `X-Powered-By`, usa Helmet para cabeçalhos de segurança e restringe CORS às origens declaradas em `CORS_ALLOWED_ORIGINS`.

O parser JSON é aplicado somente às rotas que recebem body. Atualmente, `POST /api/v1/extratos-bancarios` aceita até 10 KB; as demais rotas não fazem parsing de body.

Em produção, requisições precisam chegar por HTTPS. Quando o TLS termina em proxy reverso, `TRUST_PROXY` deve conter a quantidade de proxies confiáveis para que o Express avalie corretamente `X-Forwarded-Proto`.

Todas as requisições passam por rate limiting baseado no IP do cliente. O limite global é de 50 requisições por minuto. Os limitadores de login, cadastro e redefinição de senha são criados a cada instância da aplicação para que seus contadores não sejam compartilhados entre instâncias de teste.

## 4.3 Cookie de autenticação

O cookie reservado para autenticação é `lpshub_access_token`. Ele é emitido pelos endpoints de autenticação com `HttpOnly`, `SameSite=Strict`, `Path=/` e `Secure` em produção. Nenhum domínio é definido, mantendo o cookie restrito ao host que o emitiu. Em desenvolvimento, `Secure` permanece desativado para permitir o uso por HTTP local.

O JWT contém o identificador criptograficamente aleatório da sessão. A sessão fica no PostgreSQL e possui `createdAt` e `lastActivityAt`; o middleware autenticado atualiza apenas a última atividade em cada requisição autenticada e validada. Após duas horas sem atividade ou oito horas desde a criação da sessão, a sessão é excluída no servidor, o cookie é removido e a API retorna `401`.

O logout exige somente autenticação por cookie. Ele exclui apenas a sessão vinculada ao cookie autenticado e remove esse cookie da resposta.

A desativação de usuário é uma operação administrativa. Ela desativa a conta e remove todas as suas sessões em uma transação. Em cada requisição autenticada, o middleware também verifica o status da conta e remove a sessão atual quando o usuário estiver inativo.

---

# 5. Controllers

Responsabilidade:

- receber requisições;
- extrair dados;
- chamar services;
- retornar respostas HTTP.

Controllers devem ser pequenos.

Exemplo:

```js
export async function getCustomers(req, res, next) {
    try {
        const result = await customerService.getCustomers(req.query);

        return res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}
```

---

# 6. Services

Services representam a camada de aplicação.

Responsabilidades:

- regras de negócio;
- orquestração;
- validações de negócio;
- combinação de dados;
- comunicação coordenada com repositories;
- comunicação coordenada com integrações.

---

# 7. Repositories

Responsabilidade:

- persistência;
- consultas;
- operações no PostgreSQL;
- acesso através do Prisma.

Repositories não devem decidir se uma operação é permitida pelo negócio.

---

# 8. Routes

Responsabilidade:

- endpoints;
- HTTP methods;
- middlewares;
- controllers.

Exemplo:

```js
router.get(
    "/customers",
    authMiddleware,
    customerController.getCustomers
);
```

---

# 9. Middlewares

Responsabilidade:

- autenticação;
- autorização;
- validação;
- tratamento de erros;
- logging;
- preocupações transversais.

---

# 10. Utils

Responsabilidade:

- funções técnicas reutilizáveis;
- helpers;
- formatação;
- paginação;
- manipulação técnica de dados.

Não utilizar `utils` para esconder regras de negócio.

---

# 11. Princípios

### Separação de responsabilidades

Cada camada possui uma função específica.

### Baixo acoplamento

Uma camada não deve conhecer detalhes internos desnecessários de outra.

### Alta coesão

Código relacionado deve permanecer agrupado.

### Dependência em uma direção

A comunicação deve seguir preferencialmente:

```text
Routes
 ↓
Controllers
 ↓
Services
 ↓
Repositories
 ↓
Database
```

---

# 12. Regra de Dependência

Evitar:

```text
Controller → Prisma
Controller → PostgreSQL
Route → Prisma
Route → Service + regra de negócio
Repository → Controller
Repository → HTTP
```

Preferir:

```text
Controller → Service
Service → Repository
Repository → Prisma
```

---

# 13. Integrações

Detalhes específicos de SAP e outros serviços externos devem ficar isolados.

O restante da aplicação não deve depender de detalhes como:

- URL;
- autenticação;
- formato específico;
- headers;
- tokens;
- paginação;
- tratamento específico de erros;

de um sistema externo.

Esses detalhes devem ser encapsulados na camada de integração apropriada.

---

# 14. Validação de Requisições

As rotas validam os dados recebidos com Zod antes de alcançarem os controllers.
O fluxo é:

```text
Request
  ↓
Zod middleware
  ↓
Controller
```

Bodies, queries e params devem possuir schema explícito. Headers também são
validados quando participam da regra da rota, como o cookie nas operações
administrativas. Os dados validados ficam em `req.validated`; controllers não
devem usar dados brutos para executar a regra de negócio.

---

# 15. Observabilidade e contexto de requisição

Toda requisição recebe um `requestId` gerado internamente com `crypto.randomUUID()` antes dos demais middlewares. O mesmo identificador é retornado no header `X-Request-ID` e acompanha os logs operacionais e os registros de auditoria.

O `AsyncLocalStorage` mantém `requestId`, `userId`, `sessionId` e `ip` disponíveis durante a cadeia assíncrona. O `sessionId` permanece apenas no contexto interno e nunca é incluído automaticamente em logs ou registros de auditoria.

O fluxo transversal ocorre nesta ordem:

```text
requestContext
   ↓
requestLogger (Pino HTTP)
   ↓
audit
   ↓
middlewares funcionais
   ↓
controller → service → repository / integration
```

O Pino produz JSON em UTC, registra duração e status HTTP e classifica respostas `4xx` como `warn` e respostas `5xx` como `error`. Em desenvolvimento, o transport `pino-pretty` formata a saída para leitura local em uma worker thread. Em produção e nos testes automatizados, a saída permanece em JSON sem esse transport. Requisições com duração igual ou superior a 1 segundo geram também o evento operacional `HTTP_SLOW_REQUEST`.

A origem de erros com código iniciado por `SAP_` é classificada como `sap`; as demais falhas são classificadas como `application`.

A persistência de auditoria segue `requestContext → pino-http → audit → auditService → auditRepository → Prisma`. Os services registram o significado da operação, enquanto o middleware completa os dados HTTP e persiste exatamente um evento por requisição.

O middleware aguarda o `INSERT` de auditoria antes de concluir a resposta. Login e logout são as únicas exceções: nessas rotas a resposta é liberada e a persistência continua de forma assíncrona. Uma falha de persistência gera um erro operacional no Pino sem registrar o conteúdo da requisição ou da resposta.

Eventos e ações pertencem a listas fechadas. A rota é mantida para diagnóstico, mas a consulta histórica deve usar principalmente `eventType` e `action`, que permanecem estáveis mesmo quando o contrato HTTP evolui.

O catálogo `src/config/auditRoutes.js` vincula método, caminho, evento, `AuditAction` e sistema de destino. As definições das rotas reutilizam os caminhos desse catálogo, e o middleware global resolve a ação antes de HTTPS, rate limit, Zod, autenticação e controller. Dessa forma, respostas antecipadas também permanecem dentro do processo de auditoria.

O repository de auditoria expõe somente criação. Não existem operações de atualização ou exclusão na aplicação; uma futura política de retenção deve utilizar uma credencial administrativa separada.
