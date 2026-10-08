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
