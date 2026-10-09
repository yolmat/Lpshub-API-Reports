# Regras de Negócio

## 1. Objetivo

Este documento contém as regras funcionais e de negócio que devem ser respeitadas pela API.

As regras aqui descritas possuem prioridade sobre decisões de implementação.

---

# 2. Objetivo da API

A API tem como principal finalidade disponibilizar informações armazenadas no ambiente SAP para aplicações consumidoras.

A API não deve modificar informações do SAP sem que essa responsabilidade seja explicitamente definida.

O comportamento padrão do projeto deve ser orientado à consulta e disponibilização de informações.

---

# 3. Origem dos Dados

Os dados disponibilizados pela API possuem como origem o ambiente SAP e/ou fontes relacionadas ao processo de integração definido pelo projeto.

A origem específica, entidades e estratégia de consulta devem ser documentadas em:

```text
docs/integrations.md
```

---

# 4. Regras de Consulta

### REG-001

Toda consulta deve retornar somente dados aos quais o usuário autenticado possui autorização de acesso.

### REG-002

Filtros recebidos pela API devem ser validados antes de serem utilizados.

### REG-003

Consultas que possam retornar grandes quantidades de dados devem possuir paginação quando aplicável.

### REG-004

A API não deve expor campos internos ou sensíveis que não façam parte do contrato daquele endpoint.

### REG-005

A API deve preservar a integridade dos dados recebidos da origem.

### REG-006

Cada consulta ao SAP Business One Service Layer deve abrir uma sessão por login, executar a consulta e encerrar a mesma sessão por logout, inclusive quando a consulta falhar.

### REG-007

Quando o SAP retornar `odata.nextLink`, a API deve consultar as páginas seguintes até que esse campo não esteja presente e reunir todos os itens retornados.

---

# 5. Autenticação

### REG-010

Endpoints protegidos exigem autenticação válida.

### REG-011

A autenticação deve utilizar JWT.

### REG-012

Tokens inválidos, expirados ou ausentes devem impedir o acesso aos endpoints protegidos.

---

# 6. Usuários

### REG-020

Usuários devem possuir credenciais protegidas.

### REG-021

Senhas devem ser armazenadas utilizando `crypto.scrypt` com salt aleatório exclusivo por senha.

### REG-022

Senhas nunca devem ser retornadas em respostas da API.

### REG-023

Credenciais não devem aparecer em logs.

### REG-024

Cada usuário deve possuir login e email únicos. O cliente deve informar o login já no formato definido pela empresa.

### REG-025

Usuários possuem os papéis `ADM` e `USER`. Novos usuários recebem `USER` até que uma regra autorizada defina outro papel.

### REG-026

Somente usuários autenticados com papel `ADM` podem criar usuários ou redefinir senhas de outros usuários.

### REG-027

A redefinição de senha exige login e email do usuário de destino. A senha aplicada é obtida exclusivamente de `PASSWORD_RESET_DEFAULT`, variável de ambiente que não pode ser exposta pela API.

### REG-028

O cookie de autenticação deve usar `HttpOnly`, `SameSite=Strict` e `Path=/`. Em produção, ele também deve usar `Secure`.

### REG-029

Cada login cria uma sessão identificada por valor aleatório criptograficamente seguro. A sessão registra `lastActivityAt`, atualizado em toda requisição autenticada e validada. Depois de duas horas sem atividade ou oito horas desde sua criação, a sessão deve ser excluída no servidor e a API deve responder `401`.

### REG-030

O logout exige autenticação pelo cookie. A operação exclui somente a sessão vinculada ao cookie atual e remove o cookie do navegador.

### REG-031

Somente administradores podem desativar usuários. A desativação marca a conta como inativa e exclui todas as sessões do usuário. Toda requisição autenticada deve conferir o status da conta; ao identificar conta inativa, a sessão atual é removida e a API retorna `401`.

### REG-032

Somente administradores podem listar usuários. A listagem retorna os campos administrativos da conta, mas nunca `passwordHash`, sessões ou identificadores de sessão.

### REG-033

A consulta do usuário autenticado exige cookie de sessão válido e retorna somente `id`, `login` e `email` da própria conta.

---

# 7. Autorização

Autenticação e autorização são conceitos diferentes.

Autenticação responde:

```text
"Quem é o usuário?"
```

Autorização responde:

```text
"O que esse usuário pode fazer?"
```

Endpoints que possuírem restrições específicas devem validar as permissões correspondentes.

---

# 8. Regras Ainda Não Definidas

As seguintes decisões ainda devem ser especificadas conforme o projeto evoluir:

- níveis de acesso;
- perfis de usuário;
- permissões por endpoint;
- empresas permitidas por usuário;
- filiais permitidas por usuário;
- filtros obrigatórios;
- dados sensíveis;
- regras específicas de cada relatório;
- regras de cache;
- regras de atualização dos dados;
- periodicidade de sincronização;
- comportamento em caso de indisponibilidade do SAP.

Não inventar essas regras sem definição explícita.

---

# 9. Regra para Novos Módulos

Todo novo módulo deve identificar:

1. Qual problema resolve.
2. Quais dados utiliza.
3. Qual é a origem desses dados.
4. Quem pode acessá-los.
5. Quais filtros existem.
6. Quais regras de negócio existem.
7. Quais erros podem ocorrer.
8. Se existe necessidade de paginação.
9. Se existe necessidade de cache.
10. Se existe impacto em banco ou integração.

---

# 10. Alterações de Regras

Quando uma regra for alterada:

1. atualizar este documento;
2. verificar impacto na API;
3. verificar impacto nos testes;
4. verificar impacto na documentação da API;
5. implementar a alteração;
6. validar o comportamento.

Nunca alterar uma regra de negócio somente no código e deixar a documentação desatualizada.

---

# 11. Validação de entrada

Todo body, query string e parâmetro de rota deve ser validado antes do controller.
Campos não previstos no contrato são rejeitados. Nas rotas administrativas, o
header `Cookie` deve conter o cookie de autenticação antes da verificação do token.

---

# 12. Limite de requisições

Todas as rotas aceitam até 50 requisições por minuto por IP. Login e cadastro
aceitam até 15 requisições por minuto cada um. A redefinição de senha aceita até
5 requisições por minuto. Quando um limite é excedido, a API retorna `429
RATE_LIMIT_EXCEEDED`.

---

# 13. Logs operacionais e auditoria

### REG-040

Toda requisição deve receber um `requestId` UUID gerado pela API. Identificadores fornecidos pelo cliente não substituem o valor interno.

### REG-041

Logs nunca devem registrar senha, cookie, header de autorização, tokens, Session ID, credenciais SAP, API keys, connection strings, secrets ou payload financeiro completo.

### REG-042

O IP deve ser obtido por `req.ip`. Headers encaminhados somente serão considerados quando `TRUST_PROXY` declarar exatamente a quantidade de proxies confiáveis entre o cliente e a API.

### REG-043

Datas de auditoria são persistidas em UTC. A conversão para `America/Sao_Paulo` pertence à camada de apresentação.

### REG-044

O campo `metadata` de auditoria aceita somente propriedades definidas na allow-list do tipo de evento e valores primitivos. Objetos completos recebidos do cliente não podem ser persistidos nesse campo.

### REG-045

Cada requisição produz um log operacional no Pino e um registro corporativo no `AuditLog`. O log operacional diagnostica a execução; a auditoria registra ator, ação semântica, origem, momento e resultado.

### REG-046

O `AuditLog` é append-only para a aplicação. O repository pode executar somente `INSERT`; atualização e exclusão pertencem exclusivamente a uma futura política administrativa de retenção.

### REG-047

Login bem-sucedido, falha de login, logout, expiração de sessão, acesso negado e falha de validação devem possuir eventos explícitos. Consultas de extrato usam a ação estável `BANK_STATEMENT_SEARCH`, independentemente do nome futuro da rota.

### REG-048

Request e response completos não são armazenados. A auditoria guarda somente contagens, tamanho da resposta e filtros resumidos definidos pela allow-list. O identificador de sessão é transformado em referência SHA-256 antes da persistência.

### REG-049

A resposta aguarda a persistência da auditoria, exceto nas rotas de login e logout. Nessas duas rotas, a gravação ocorre de forma assíncrona após a resposta ao cliente.

### REG-050

Uma futura consulta administrativa ao histórico deve registrar `AUDIT_LOG_VIEWED`. Nenhuma rota de leitura de auditoria está definida nesta etapa.

### REG-051

Toda rota deve possuir uma entrada em `AUDITED_ROUTES` com método, caminho, evento, `AuditAction` e sistema de destino. A rota deve utilizar o caminho dessa mesma definição. Não é permitido cadastrar uma rota funcional com a ação genérica `HTTP_REQUEST`.

### REG-052

A verificação autenticada do Service Layer abre uma sessão SAP para confirmar conectividade e credenciais, encerra essa sessão em `finally` e não consulta nem retorna dados externos.
