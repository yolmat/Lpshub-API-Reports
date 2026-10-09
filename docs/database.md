# Banco de Dados

## 1. Tecnologia

O banco de dados da aplicação é:

```text
PostgreSQL
```

O acesso é realizado através de:

```text
Prisma ORM
```

---

# 2. Arquitetura de Acesso

O acesso ao banco deve seguir:

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

Controllers e services não devem acessar Prisma diretamente.

---

# 3. Prisma

O Prisma será utilizado como camada ORM da aplicação.

## 3.1 Model User

O model `User` representa a conta de acesso da API. Ele possui identificador técnico, `login` e `email` únicos, `passwordHash`, `status`, `role`, `createdAt` e `updatedAt`.

`UserRole` aceita `ADM` e `USER`; novas contas recebem `USER` como padrão. O status começa ativo. O login é informado pelo cliente já no formato definido pela empresa.

A migration `20260930120000_add_user_model` cria o enum, a tabela e os índices únicos de login e email.

## 3.2 Model UserSession

O model `UserSession` representa uma sessão de autenticação ativa. Ele possui identificador aleatório, referência ao usuário, `lastActivityAt` e `createdAt`. A migration `20260930075308_add_user_sessions` cria a tabela, o índice de `userId` e a exclusão em cascata quando o usuário é removido.

A desativação de usuário atualiza `User.status` e exclui as sessões vinculadas em uma única transação.

O Prisma Client é gerado pelo provider `prisma-client-js`, compatível com a importação de `@prisma/client` utilizada pelos repositories.

## 3.3 Model AuditLog

O model `AuditLog` mantém a trilha corporativa append-only. `id` e `requestId` usam UUID; `createdAt` usa `TIMESTAMPTZ` UTC. O registro contém snapshots opcionais de `userId` e `username`, IP, user agent, evento, ação, sistema de destino, método, rota, status, sucesso, duração, contagem de registros, código de erro, referência SHA-256 da sessão e `metadata` JSONB controlado.

`AuditEventType` e `AuditAction` são enums fechados. Existem índices para `createdAt`, `userId`, `requestId`, `eventType`, `action`, `route`, `success` e `ipAddress`.

As ações `API_STATUS_CHECK` e `HEALTH_CHECK` identificam explicitamente as rotas técnicas, evitando o uso de `HTTP_REQUEST` em rotas conhecidas.

A consulta administrativa de usuários seleciona somente `id`, `login`, `email`, `status`, `role`, `createdAt` e `updatedAt`; `passwordHash` e sessões não são carregados para essa operação.

Não existe chave estrangeira entre `AuditLog.userId` e `User`. Essa decisão preserva o snapshot sem atualizações automáticas caso a conta de origem deixe de existir.

A migration `20261009120000_add_audit_logs` cria a tabela, a chave estrangeira e os índices.
A migration `20261009130000_expand_audit_logs` remove a relação mutável, preserva os registros existentes e adiciona os campos e enums da trilha corporativa.
A migration `20261009140000_add_route_audit_actions` adiciona as ações das rotas técnicas ao enum `AuditAction`.
A migration `20261009160000_add_current_user_audit_action` adiciona o evento e a ação usados pela consulta do usuário autenticado.
A migration `20261009170000_add_service_layer_connection_audit_action` adiciona o evento e a ação da verificação de conectividade do Service Layer.

Responsabilidades:

- modelagem;
- acesso aos dados;
- migrations;
- relacionamento entre entidades;
- queries;
- transações.

---

# 4. Repositories

Cada domínio pode possuir seu próprio repository.

Exemplo:

```text
src/repositories/
├── userRepository.js
├── customerRepository.js
└── salesRepository.js
```

O repository deve encapsular o acesso ao Prisma.

---

# 5. Schema

O schema do Prisma deve representar o banco utilizado pela aplicação.

Alterações estruturais devem ser avaliadas antes de serem implementadas.

---

# 6. Migrations

Alterações no banco devem utilizar migrations do Prisma.

O histórico atual tem uma dependência fora de ordem para uma instalação em banco vazio: `20260930075308_add_user_sessions` cria uma FK para `User`, mas essa tabela é criada apenas em `20260930120000_add_user_model`. A instalação integral em uma base vazia exige uma correção específica desse histórico. Um banco existente com migrations aplicadas não comprova a viabilidade de executar a sequência desde o início. Veja as instruções e limitações no [guia de inicialização](../documentação.md#inicializacao).

Antes de uma alteração:

1. identificar o impacto;
2. alterar o schema;
3. gerar migration;
4. validar a migration;
5. testar a aplicação;
6. documentar alterações relevantes.

---

# 7. Integridade

Não criar relacionamentos ou constraints sem entender o domínio.

Dados provenientes de sistemas externos devem ser tratados cuidadosamente para evitar:

- duplicidade;
- perda de informação;
- inconsistências;
- relacionamentos incorretos.

---

# 8. Performance

Evitar:

- N+1 queries;
- consultas sem necessidade;
- busca de todos os registros quando apenas alguns são necessários;
- carregamento excessivo de relacionamentos;
- ausência de índices em campos frequentemente pesquisados.

Queries devem retornar somente os campos necessários quando isso trouxer benefício relevante.

---

# 9. Transações

Operações que precisem ser atômicas devem utilizar transações.

Uma operação composta por múltiplas alterações dependentes não deve deixar o banco em estado parcialmente atualizado.

---

# 10. Dados do SAP

O banco PostgreSQL da aplicação não deve ser automaticamente considerado como equivalente ao banco de dados do SAP.

A origem, sincronização e estratégia de armazenamento dos dados SAP devem ser documentadas em:

```text
docs/integrations.md
```

Caso a aplicação consulte diretamente uma fonte SAP, os detalhes dessa integração também devem ser documentados.
