# AGENTS.md

## 1. Objetivo do Projeto

Esta aplicação é uma API backend responsável por disponibilizar informações armazenadas no ambiente SAP para sistemas consumidores, como aplicações web, dashboards, ferramentas de BI e outros serviços.

A API deve atuar como uma camada de integração e exposição de dados, mantendo separadas:

- regras de negócio;
- acesso aos dados;
- regras de autenticação;
- tratamento das requisições HTTP;
- integrações externas;
- configurações da aplicação.

O projeto deve priorizar segurança, organização, manutenção, rastreabilidade e previsibilidade.

---

## 2. Idioma

Todo o projeto deve utilizar português-br quando o conteúdo for destinado a usuários ou documentação interna.

Isso inclui:

- mensagens de erro;
- mensagens de validação;
- documentação;
- comentários relevantes;
- nomes de regras de negócio documentadas.

Código-fonte, nomes de arquivos, funções, classes e variáveis devem seguir as convenções definidas neste documento.

---

## 3. Stack Tecnológica

A aplicação utiliza:

- Node.js
- Express
- JavaScript
- ECMAScript Modules (ES Modules)
- PostgreSQL
- Prisma ORM
- JWT
- bcrypt

### JavaScript

O projeto deve utilizar ES Modules.

Utilizar:

```js
import express from "express";
```

e:

```js
export default router;
```

ou:

```js
export { minhaFuncao };
```

Não utilizar CommonJS:

```js
const express = require("express");
```

ou:

```js
module.exports = router;
```

---

# 4. Arquitetura

A aplicação segue uma arquitetura em camadas:

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

Fluxo esperado:

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

Quando houver integração com sistemas externos:

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
Repository / Integration
   ↓
SAP / Serviço externo
```

Cada camada possui uma responsabilidade específica e não deve assumir responsabilidades pertencentes às demais.

---

# 5. Responsabilidades das Pastas

## 5.1 config/

Responsável pelas configurações da aplicação.

Pode conter:

- configuração de ambiente;
- variáveis de ambiente;
- configuração do Prisma;
- configuração de JWT;
- configurações de serviços externos;
- constantes de infraestrutura;
- configurações globais.

Não deve conter:

- regras de negócio;
- controllers;
- queries específicas de negócio.

Exemplos:

```text
src/config/
├── env.js
├── database.js
└── auth.js
```

---

## 5.2 controllers/

Responsável pela camada HTTP.

Controllers devem:

- receber `req`;
- extrair parâmetros, query params e body;
- chamar o service correspondente;
- retornar respostas HTTP;
- definir status HTTP apropriados;
- encaminhar erros para o middleware de tratamento.

Controllers não devem:

- executar queries diretamente;
- acessar Prisma diretamente;
- implementar regras de negócio;
- realizar autenticação manual;
- conter lógica complexa;
- acessar sistemas externos diretamente.

Um controller deve ser fino.

Exemplo conceitual:

```text
Request
   ↓
Controller
   ↓
Service
   ↓
Response
```

---

## 5.3 middlewares/

Responsável por comportamentos executados durante o ciclo HTTP antes ou depois dos controllers.

Pode conter:

- autenticação JWT;
- autorização;
- tratamento global de erros;
- validação de requisições;
- logging;
- controle de acesso;
- tratamento de informações da requisição.

Exemplos:

```text
src/middlewares/
├── authMiddleware.js
├── errorMiddleware.js
└── validateMiddleware.js
```

Middleware não deve conter regras específicas de negócio que pertençam aos services.

---

## 5.4 repositories/

Responsável pelo acesso aos dados.

Repositories devem:

- executar operações através do Prisma;
- consultar PostgreSQL;
- criar registros;
- atualizar registros;
- excluir registros;
- buscar registros;
- encapsular queries;
- abstrair o acesso ao banco.

Controllers e services não devem executar Prisma diretamente.

Exemplo:

```text
Service
   ↓
Repository
   ↓
Prisma
   ↓
PostgreSQL
```

Repositories não devem decidir regras de negócio.

Exemplo de responsabilidade correta:

```text
Repository:
"Buscar vendas do período X."
```

Exemplo de responsabilidade incorreta:

```text
Repository:
"Verificar se o usuário pode visualizar vendas porque possui determinada permissão."
```

A segunda decisão pertence à camada de serviço/autorização.

---

## 5.5 routes/

Responsável exclusivamente pelo roteamento HTTP.

Routes devem:

- definir endpoints;
- associar HTTP methods;
- associar controllers;
- aplicar middlewares necessários.

Exemplo:

```text
GET /api/v1/sales
    ↓
authMiddleware
    ↓
salesController.getSales
```

Routes não devem:

- executar queries;
- conter regras de negócio;
- realizar processamento complexo;
- acessar Prisma.

### Regra obrigatória de auditoria para novas rotas

Toda nova rota criada deve possuir obrigatoriamente uma ação semântica de auditoria no enum `AuditAction`.

Ao criar uma rota:

1. identificar a ação de negócio executada;
2. verificar se já existe uma ação semanticamente equivalente em `AuditAction`;
3. adicionar uma nova opção ao enum `AuditAction` quando não existir uma ação adequada;
4. espelhar a ação na lista fechada `AUDIT_ACTIONS` da aplicação;
5. cadastrar método, caminho, evento, ação e sistema em `AUDITED_ROUTES`;
6. utilizar na definição da rota o caminho fornecido pela mesma entrada de `AUDITED_ROUTES`;
7. registrar a ação no fluxo de auditoria da rota através do `auditService`;
8. criar a migration correspondente quando o enum Prisma for alterado;
9. adicionar testes que comprovem o evento e a ação persistidos;
10. atualizar a documentação relacionada.

Não criar uma rota sem `AuditAction`. Não reutilizar uma ação genérica apenas para evitar a criação da ação semântica correta.

### Regra obrigatória de autenticação para rotas

Toda rota deve executar o middleware `authenticate`, após as validações Zod necessárias e antes do controller.

As únicas exceções permitidas são:

1. `POST /api/v1/auth/login`, pois é a rota que inicia a autenticação;
2. `GET /api`, usado como verificação pública de disponibilidade da API.

Ao criar ou alterar uma rota, verificar explicitamente se ela aplica `authenticate`. Não criar exceções adicionais sem uma regra de negócio documentada e aprovada.

---

## 5.6 services/

Responsável pela lógica de aplicação e pelas regras de negócio.

Services podem:

- coordenar repositories;
- validar regras de negócio;
- combinar dados de diferentes fontes;
- coordenar integrações;
- transformar dados quando necessário;
- executar fluxos de negócio;
- controlar transações quando necessário.

Services representam o principal ponto de decisão da aplicação.

Exemplo:

```text
Controller
    ↓
SalesService
    ├── SalesRepository
    ├── CustomerRepository
    └── SAP Integration
```

---

## 5.7 utils/

Responsável por funções auxiliares reutilizáveis que não pertencem especificamente a uma regra de negócio.

Pode conter:

- formatadores;
- helpers;
- funções de data;
- funções de paginação;
- geração de identificadores;
- funções de manipulação técnica de dados;
- utilitários relacionados a respostas;
- funções criptográficas auxiliares.

Não utilizar `utils` como depósito de código sem responsabilidade definida.

Se uma função representa uma regra de negócio, ela deve pertencer ao service apropriado.

---

# 6. Regras Gerais de Arquitetura

### Regra ARQ-001

Cada arquivo deve possuir uma responsabilidade clara.

### Regra ARQ-002

Controllers não devem acessar Prisma diretamente.

### Regra ARQ-003

Routes não devem conter regras de negócio.

### Regra ARQ-004

Repositories não devem conter regras de negócio.

### Regra ARQ-005

Services devem concentrar as regras de negócio e a orquestração da aplicação.

### Regra ARQ-006

Middlewares devem tratar preocupações transversais da aplicação.

### Regra ARQ-007

Configurações devem ficar isoladas em `config/`.

### Regra ARQ-008

Código reutilizável e puramente técnico deve ficar em `utils/`.

### Regra ARQ-009

Não criar abstrações sem necessidade real.

### Regra ARQ-010

Não duplicar lógica existente. Antes de criar uma nova implementação, procurar por uma implementação existente que possa ser reutilizada.

---

# 7. Banco de Dados

O PostgreSQL é o banco utilizado pela aplicação.

O acesso ao banco deve ocorrer através do Prisma.

Fluxo:

```text
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

Não utilizar SQL diretamente dentro dos controllers ou services quando uma operação equivalente puder ser realizada pelo Prisma.

Alterações de schema devem ser tratadas através das migrations do Prisma.

Nunca alterar o banco de produção manualmente sem identificar o impacto da alteração.

---

# 8. Autenticação

A autenticação da API utiliza JWT.

Senhas devem ser protegidas utilizando bcrypt.

Nunca:

- armazenar senha em texto puro;
- retornar senha na API;
- armazenar tokens ou secrets diretamente no código;
- versionar `.env`;
- expor secrets em logs.

Secrets devem utilizar variáveis de ambiente.

---

# 9. Segurança

A API deve seguir o princípio de menor privilégio.

Cada endpoint deve possuir somente as permissões necessárias.

Dados sensíveis não devem aparecer em:

- respostas desnecessárias;
- logs;
- mensagens de erro;
- commits;
- arquivos versionados.

Nunca inserir:

```text
JWT_SECRET
DATABASE_URL
senha
token
credenciais SAP
API keys
```

diretamente no código.

---

# 10. Variáveis de Ambiente

Variáveis de ambiente devem ser utilizadas para:

- credenciais;
- URLs;
- secrets;
- portas;
- configurações específicas do ambiente;
- informações de serviços externos.

O projeto deve possuir:

```text
.env
.env.example
```

O `.env` nunca deve ser commitado.

O `.env.example` deve documentar as variáveis necessárias sem conter valores reais.

---

# 11. API

A API deve utilizar princípios REST.

Endpoints devem:

- possuir nomes claros;
- utilizar HTTP methods corretamente;
- utilizar status codes apropriados;
- possuir respostas previsíveis;
- validar entradas;
- tratar erros de maneira consistente.

Sempre que possível, utilizar versionamento:

```text
/api/v1/...
```

---

# 12. Validação

Dados recebidos externamente devem ser considerados não confiáveis.

Validar:

- body;
- params;
- query;
- headers quando necessário.

A validação deve ocorrer antes da execução da lógica de negócio.

---

# 13. Tratamento de Erros

Erros devem ser tratados de forma centralizada sempre que possível.

Não utilizar:

```js
try {
   ...
} catch (error) {
   console.log(error);
}
```

sem tratar ou encaminhar corretamente o erro.

Não retornar stack traces ou informações internas para o cliente em produção.

As mensagens apresentadas ao cliente devem ser claras, mas não devem expor informações sensíveis.

---

# 14. Logs

Logs devem ser utilizados para facilitar:

- diagnóstico;
- monitoramento;
- identificação de falhas;
- acompanhamento de integrações.

Não registrar:

- senhas;
- JWTs;
- secrets;
- credenciais;
- informações sensíveis desnecessárias.

---

# 15. Integração com SAP

A aplicação possui como objetivo disponibilizar informações provenientes do ambiente SAP.

A forma de integração deve permanecer isolada da camada HTTP.

Controllers não devem conhecer detalhes da integração com SAP.

A comunicação deve ser encapsulada em uma camada apropriada e chamada pelos services.

Detalhes da integração devem ser documentados em:

```text
docs/integrations.md
```

---

# 16. Performance

Priorizar consultas eficientes.

Evitar:

- consultas desnecessárias;
- N+1 queries;
- carregamento de grandes volumes sem paginação;
- processamento duplicado;
- chamadas externas repetidas sem necessidade.

Endpoints que retornam grandes volumes de dados devem utilizar paginação quando aplicável.

---

# 17. Código

O código deve priorizar:

- legibilidade;
- simplicidade;
- previsibilidade;
- manutenção;
- baixo acoplamento;
- alta coesão.

Evitar:

- funções gigantes;
- arquivos gigantes;
- condições excessivamente complexas;
- abstrações prematuras;
- código duplicado;
- comentários explicando código óbvio.

Comentários devem explicar decisões ou comportamentos não óbvios.

---

# 18. Alterações no Projeto

Antes de alterar código:

1. Ler o `AGENTS.md`.
2. Identificar a camada afetada.
3. Ler a documentação relevante em `/docs`.
4. Inspecionar o código existente.
5. Identificar padrões já utilizados.
6. Reutilizar implementações existentes quando possível.
7. Fazer a menor alteração necessária.

Não reescrever código funcional sem necessidade.

Não alterar arquitetura sem justificativa.

---

# 19. Novas Dependências

Antes de adicionar uma dependência:

1. Verificar se o problema pode ser resolvido com o código existente.
2. Verificar se alguma dependência já instalada resolve o problema.
3. Avaliar manutenção e segurança da nova dependência.
4. Adicionar somente se houver benefício claro.

---

# 20. Testes

Novas funcionalidades devem possuir testes quando houver infraestrutura de testes disponível.

Alterações devem, sempre que possível, validar:

- comportamento esperado;
- casos de erro;
- validações;
- regras de negócio;
- integração entre camadas.

---

# 21. Git

Utilizar Conventional Commits.

Exemplos:

```text
feat: adiciona consulta de clientes
fix: corrige paginação de vendas
refactor: reorganiza service financeiro
docs: atualiza regras de negócio
test: adiciona testes para autenticação
chore: atualiza dependências
```

Commits devem representar mudanças coerentes.

---

# 22. Documentação

As documentações principais estão em:

```text
docs/
├── architecture.md
├── business-rules.md
├── api-specification.md
├── database.md
└── integrations.md
```

Quando uma alteração modificar uma regra, arquitetura, endpoint, banco ou integração, a documentação correspondente deve ser atualizada.

---

# 23. Regra de Ouro

Não assumir requisitos que não foram definidos.

Quando uma implementação depender de uma decisão de negócio ainda não documentada:

1. identificar a decisão;
2. verificar se existe alguma regra relacionada;
3. não inventar uma regra silenciosamente;
4. informar a necessidade da decisão antes de implementar comportamento crítico.

Quando houver conflito entre documentação e código existente, identificar o conflito e não assumir automaticamente que o código existente está correto.

---

# 24. Ordem de Prioridade

Ao tomar decisões durante o desenvolvimento, considerar:

1. Segurança
2. Regras de negócio documentadas
3. Arquitetura documentada
4. Contrato da API
5. Consistência com o código existente
6. Performance
7. Simplicidade
8. Conveniência de implementação

O comportamento existente não deve prevalecer automaticamente sobre uma regra documentada.

---

# 25. Objetivo do Agente

O Codex deve atuar como um agente de desenvolvimento dentro deste projeto.

Antes de implementar, deve compreender o contexto.

Durante a implementação, deve respeitar a arquitetura.

Depois da implementação, deve validar o resultado.

O objetivo não é apenas produzir código que funcione, mas produzir código consistente com a arquitetura, as regras de negócio, a segurança e a evolução futura do projeto.

# 26. Manutenção Automática da Documentação

A documentação do projeto faz parte do código e deve permanecer sincronizada com a implementação.

Ao realizar qualquer tarefa, o agente deve avaliar se novas informações foram descobertas, definidas ou alteradas.

## 26.1 Quando atualizar a documentação

Atualizar a documentação quando a tarefa alterar ou definir:

- arquitetura;
- estrutura de pastas;
- responsabilidades de componentes;
- regras de negócio;
- endpoints;
- contratos de API;
- autenticação;
- autorização;
- banco de dados;
- modelos Prisma;
- integrações externas;
- integração com SAP;
- decisões técnicas;
- padrões de desenvolvimento;
- comportamentos importantes do sistema.

## 26.2 Arquivo correspondente

Utilizar o documento mais adequado:

```text
docs/
├── architecture.md
├── business-rules.md
├── api-specification.md
├── database.md
├── integrations.md
└── decisions.md
```

### architecture.md

Utilizar para:

- arquitetura;
- organização das camadas;
- responsabilidades;
- padrões estruturais;
- fluxo de dados.

### business-rules.md

Utilizar para:

- regras de negócio;
- restrições;
- comportamentos obrigatórios;
- permissões;
- condições de processamento.

### api-specification.md

Utilizar para:

- endpoints;
- métodos HTTP;
- parâmetros;
- request body;
- response;
- status codes;
- autenticação dos endpoints.

### database.md

Utilizar para:

- modelos;
- relacionamentos;
- índices;
- migrations;
- decisões relacionadas ao PostgreSQL;
- decisões relacionadas ao Prisma.

### integrations.md

Utilizar para:

- SAP;
- Service Layer;
- APIs externas;
- autenticação externa;
- endpoints externos;
- formatos de dados;
- paginação;
- timeouts;
- tratamento de erros de integração.

### decisions.md

Utilizar para decisões técnicas relevantes que afetem a evolução do projeto.

## 26.3 Regra de atualização

Quando uma informação nova for descoberta durante a implementação:

1. Identificar se ela possui valor permanente para o projeto.
2. Identificar o documento correspondente.
3. Atualizar a documentação.
4. Evitar registrar informações temporárias ou irrelevantes.
5. Não duplicar a mesma informação em múltiplos documentos sem necessidade.

## 26.4 Finalização da tarefa

Antes de considerar uma tarefa concluída, executar uma revisão:

```text
Código alterado?
        ↓
Nova informação relevante?
        ↓
Documentação precisa ser atualizada?
        ↓
Sim → atualizar /docs
        ↓
Validar código
        ↓
Finalizar tarefa
```

## 26.5 Não documentar informações temporárias

Não adicionar à documentação permanente:

- tentativas que falharam;
- hipóteses descartadas;
- debugging temporário;
- comandos executados sem relevância futura;
- detalhes irrelevantes da sessão.

Documentar somente conhecimento que será útil para futuras sessões de desenvolvimento.

## 26.6 Não inventar documentação

O agente não deve criar uma regra de negócio, decisão arquitetural ou comportamento que não tenha sido definido ou comprovado.

Quando uma informação for incerta:

- não tratá-la como fato;
- sinalizar a incerteza;
- solicitar confirmação quando necessário.

## 26.7 Consistência

Ao modificar código que contradiga a documentação existente, o agente deve:

1. identificar a inconsistência;
2. determinar se a mudança é intencional;
3. atualizar a documentação quando apropriado;
4. informar a alteração realizada.

A documentação não deve permanecer deliberadamente desatualizada após uma alteração relevante.

## 27. Checklist de Finalização

Antes de finalizar qualquer tarefa:

- [ ] Código implementado.
- [ ] Testes/validações executados quando aplicável.
- [ ] Nenhuma regra de negócio foi inventada.
- [ ] Arquitetura respeitada.
- [ ] Segurança considerada.
- [ ] Toda nova rota possui uma ação semântica no enum `AuditAction` e registro no `auditService`.
- [ ] Documentação revisada.
- [ ] `/docs` atualizado quando necessário.
- [ ] `CHANGELOG.md` atualizado quando a alteração for relevante.
- [ ] Nenhuma informação temporária foi adicionada à documentação permanente.

# 28. Uso da Documentação do Projeto

O diretório `/docs` contém o conhecimento permanente do projeto.

Antes de implementar uma funcionalidade, o agente deve identificar
e consultar os documentos relacionados à tarefa.

No mínimo:

- tarefas arquiteturais → `docs/architecture.md`
- regras de negócio → `docs/business-rules.md`
- endpoints → `docs/api-specification.md`
- banco → `docs/database.md`
- SAP e integrações → `docs/integrations.md`
- decisões técnicas → `docs/decisions.md`

Não assumir que uma informação não existe apenas porque ela não
está presente no `AGENTS.md`.

Consultar a documentação correspondente antes de tomar decisões
importantes.
